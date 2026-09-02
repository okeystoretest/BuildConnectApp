import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";

/**
 * Limite de tentativas por janela de tempo.
 *
 * Guardado em banco (tabela RateLimit), não em memória: um contador que vive
 * no processo zera a cada deploy — e um ataque de senha só precisaria esperar
 * o próximo restart para recomeçar do zero. Em banco também vale para todas as
 * réplicas, se um dia houver mais de uma.
 *
 * Falha aberta de propósito: se a consulta ao contador der erro, a requisição
 * segue. Um problema no banco não deve derrubar o login inteiro — e o login já
 * depende do banco para validar a senha de qualquer forma.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Segundos até a janela abrir de novo (0 quando ok). */
  retryAfterSeconds: number;
}

const PASSA_LIVRE: RateLimitResult = { ok: true, retryAfterSeconds: 0 };

let proximaVarredura = 0;

/** Apaga janelas vencidas, no máximo uma vez por minuto. */
async function varrer(agora: number): Promise<void> {
  if (agora < proximaVarredura) return;
  proximaVarredura = agora + 60_000;
  try {
    await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(agora) } } });
  } catch {
    // Limpeza é oportunista: falhar aqui não pode afetar a requisição.
  }
}

/**
 * Registra uma tentativa. Devolve ok: false quando o teto da janela já foi
 * atingido — a tentativa que estoura o limite também conta, então insistir
 * durante o bloqueio não reabre a janela mais cedo.
 */
export async function consume(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const agora = Date.now();
  void varrer(agora);

  try {
    const atual = await prisma.rateLimit.findUnique({ where: { key } });

    // Sem registro ou janela vencida: começa uma nova.
    if (!atual || atual.resetAt.getTime() <= agora) {
      const resetAt = new Date(agora + windowMs);
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return PASSA_LIVRE;
    }

    // increment é atômico no banco: duas requisições simultâneas não se perdem.
    const atualizado = await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });

    if (atualizado.count > limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((atual.resetAt.getTime() - agora) / 1000),
        ),
      };
    }
    return PASSA_LIVRE;
  } catch (error) {
    console.error("[rate-limit] falha ao contar tentativa:", error);
    return PASSA_LIVRE;
  }
}

/** Zera a contagem de uma chave (ex.: login que deu certo). */
export async function reset(key: string): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } });
  } catch (error) {
    console.error("[rate-limit] falha ao zerar contador:", error);
  }
}

/**
 * IP do cliente conforme o proxy da frente (Traefik/Easy Panel).
 *
 * Lê o ÚLTIMO item de x-forwarded-for, não o primeiro. Proxy reverso não
 * substitui esse cabeçalho: ele ANEXA o IP do peer ao que o cliente mandou.
 * Quem enviar "x-forwarded-for: 1.1.1.1" chega aqui como "1.1.1.1, <ip-real>",
 * então ler o primeiro item é ler o que o atacante escreveu — e trocá-lo a
 * cada requisição daria um balde novo, anulando todo limite por IP.
 *
 * O último item é o que o proxy escreveu: o único que o cliente não controla.
 * Vale também se o proxy substituir em vez de anexar (aí só existe um item).
 *
 * Premissa: UM proxy confiável na frente. Se entrar um segundo (CDN antes do
 * Traefik), este valor passa a ser o IP do proxy interno e todos caem no mesmo
 * balde — nesse dia, pular a quantidade certa de saltos a partir do fim.
 */
export async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  if (forwarded) {
    const cadeia = forwarded.split(",");
    const ultimo = cadeia[cadeia.length - 1]?.trim();
    if (ultimo) return ultimo;
  }
  return list.get("x-real-ip") ?? "desconhecido";
}
