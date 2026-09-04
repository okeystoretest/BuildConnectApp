import type { WhatsappKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSocket, isEnabled } from "./connection";
import { jidCandidates } from "./jid";
import { MESSAGE_TEXT } from "./messages";

/**
 * Fila de envio do WhatsApp.
 *
 * Fila, e não envio direto, por três motivos que apareceram no desenho:
 *
 *  1. Publicar um formulário para 40 pessoas não pode segurar a Server Action
 *     por minutos. `enqueue` grava linhas e devolve; o envio vem depois.
 *  2. Se o WhatsApp estiver desconectado no instante da publicação, o envio
 *     direto perderia a mensagem em silêncio. Aqui ela espera.
 *  3. É a fila que produz o log por destinatário e por tipo — o mesmo registro
 *     serve de auditoria.
 *
 * NADA aqui loga telefone ou credencial. O identificador nos logs é o `userId`.
 */

/** Espera entre um envio e o outro. */
export const MIN_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 10_000;

/**
 * Intervalo ALEATÓRIO, não fixo.
 *
 * Um intervalo constante é assinatura de robô — é a regularidade que denuncia,
 * não a velocidade. A janela larga (1 a 10 s) faz o ritmo parecer humano ao
 * custo de alguns minutos num lote grande, que é tempo que ninguém está
 * esperando: o disparo é assíncrono.
 */
export function randomDelayMs(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Depois de 3 tentativas, para de tentar e assume a falha. */
const MAX_ATTEMPTS = 3;

/**
 * Enfileira uma notificação por destinatário.
 *
 * Rápido de propósito: é chamado de dentro de fluxos que o usuário está
 * esperando (publicar formulário, designar avaliação).
 */
export async function enqueue(userIds: readonly string[], kind: WhatsappKind): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;

  await prisma.whatsappMessage.createMany({
    data: unique.map((userId) => ({ userId, kind })),
  });
  return unique.length;
}

export interface DrainResult {
  enviados: number;
  falhas: number;
  /** Ficaram na fila: sem conexão, ou o lote acabou. */
  pendentes: number;
}

/** Falha que não adianta repetir. */
class PermanentFailure extends Error {}

export interface DrainOptions {
  /** Teto por rodada, para a chamada HTTP do cron não estourar o tempo. */
  limit?: number;
  /** Injetados no teste. Em produção saem do socket real. */
  sender?: (jid: string, text: string) => Promise<void>;
  resolveJid?: (candidates: string[]) => Promise<string | null>;
  delayMs?: () => number;
}

// Uma drenagem por vez. O deploy é de instância única (documentado no
// .env.example), então uma trava de processo basta — duas drenagens
// simultâneas mandariam a mesma mensagem duas vezes.
let draining = false;

export async function drainOutbox(options: DrainOptions = {}): Promise<DrainResult> {
  const limit = options.limit ?? 20;
  const delay = options.delayMs ?? randomDelayMs;

  const pendentesAgora = () =>
    prisma.whatsappMessage.count({ where: { status: "PENDENTE" } });

  if (draining) return { enviados: 0, falhas: 0, pendentes: await pendentesAgora() };
  if (!isEnabled() && !options.sender) {
    return { enviados: 0, falhas: 0, pendentes: await pendentesAgora() };
  }

  draining = true;
  try {
    let sender = options.sender;
    let resolveJid = options.resolveJid;

    if (!sender || !resolveJid) {
      const sock = await getSocket();
      // Desconectado: a fila espera. Melhor atrasar do que marcar como falha
      // o que só precisa de conexão.
      if (!sock) return { enviados: 0, falhas: 0, pendentes: await pendentesAgora() };

      sender =
        sender ??
        (async (jid, text) => {
          await sock.sendMessage(jid, { text });
        });
      resolveJid =
        resolveJid ??
        (async (candidates) => {
          // Pergunta ao WhatsApp qual das formas do número existe de fato. É
          // isto que resolve o nono dígito: contas criadas antes de 2012 estão
          // registradas sem ele, e mandar para a forma errada não entrega —
          // sem erro, sem aviso.
          const found = await sock.onWhatsApp(...candidates);
          return found?.find((f) => f.exists)?.jid ?? null;
        });
    }

    const fila = await prisma.whatsappMessage.findMany({
      where: { status: "PENDENTE" },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, kind: true, userId: true, attempts: true, user: { select: { phone: true } } },
    });

    let enviados = 0;
    let falhas = 0;

    for (const [index, msg] of fila.entries()) {
      // Espera ANTES de cada envio, menos o primeiro: o intervalo é entre
      // mensagens, e adiantar o primeiro não muda o padrão.
      if (index > 0) await sleep(delay());

      try {
        const candidates = jidCandidates(msg.user.phone);
        if (candidates.length === 0) {
          throw new PermanentFailure("Telefone ausente ou inválido no cadastro.");
        }

        const jid = await resolveJid(candidates);
        if (!jid) throw new PermanentFailure("Este número não tem WhatsApp.");

        await sender(jid, MESSAGE_TEXT[msg.kind]);

        // updateMany, e não update: a linha pode ter sumido entre a leitura da
        // fila e agora — basta o destinatário ser excluído do sistema, e o
        // cascade leva a mensagem junto. `update` LANÇA quando não acha, e o
        // erro escaparia do laço abortando os envios restantes; `updateMany`
        // sobre zero linhas simplesmente não faz nada.
        await prisma.whatsappMessage.updateMany({
          where: { id: msg.id },
          data: { status: "ENVIADO", sentAt: new Date(), attempts: msg.attempts + 1, error: null },
        });
        enviados += 1;
      } catch (e) {
        // A falha de um destinatário NÃO interrompe os demais. É por isso que
        // o try/catch está dentro do laço, e não em volta dele.
        const permanent = e instanceof PermanentFailure;
        const tentativas = msg.attempts + 1;
        const desistir = permanent || tentativas >= MAX_ATTEMPTS;
        const motivo = permanent
          ? e.message
          : e instanceof Error
            ? e.message.slice(0, 300)
            : "Falha desconhecida no envio.";

        // Mesmo motivo do updateMany acima: registrar a falha não pode, ela
        // própria, virar uma exceção que derruba o laço.
        await prisma.whatsappMessage.updateMany({
          where: { id: msg.id },
          data: {
            // Falha passageira volta para a fila; só se desiste depois de
            // MAX_ATTEMPTS ou quando repetir não tem como dar certo.
            status: desistir ? "FALHOU" : "PENDENTE",
            attempts: tentativas,
            error: motivo,
          },
        });
        if (desistir) falhas += 1;
        // userId, nunca o telefone.
        console.error(`[whatsapp] falha ao enviar ${msg.kind} para ${msg.userId}: ${motivo}`);
      }
    }

    return { enviados, falhas, pendentes: await pendentesAgora() };
  } finally {
    draining = false;
  }
}
