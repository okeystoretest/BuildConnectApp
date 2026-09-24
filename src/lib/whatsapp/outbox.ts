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

/** Espera entre um envio e o outro: de 1 segundo a 2 horas. */
export const MIN_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 7_200_000;

/**
 * Intervalo ALEATÓRIO, não fixo.
 *
 * Um intervalo constante é assinatura de robô — é a regularidade que denuncia,
 * não a velocidade. A janela vai de 1 s a 2 h; um lote grande leva horas para
 * sair, e é tempo que ninguém está esperando: o disparo é assíncrono.
 *
 * Com esperas deste tamanho a fila NÃO dorme dentro de uma requisição. Cada
 * mensagem tem o seu horário (`sendAfter`, gravado no banco), e o agendador
 * do processo (`scheduleOutboxTick`) acorda quando a próxima vence.
 */
export function randomDelayMs(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
}

/** Depois de 3 tentativas, para de tentar e assume a falha. */
const MAX_ATTEMPTS = 3;

export interface EnqueueOptions {
  /**
   * Texto da mensagem. Ausente, vale o padrão do tipo (`MESSAGE_TEXT`) — que
   * é o caso de avaliação e formulário, cujo aviso não varia. Presente quando
   * a mensagem carrega dado do momento: o nome de quem acabou de entrar, por
   * exemplo, que nenhum texto fixo teria como dizer.
   */
  text?: string;
  /** Injetados no teste. */
  now?: Date;
  delayMs?: () => number;
}

/**
 * Enfileira uma notificação por destinatário, já com horário de envio.
 *
 * Rápido de propósito: é chamado de dentro de fluxos que o usuário está
 * esperando (publicar formulário, designar avaliação).
 *
 * Os horários se encadeiam a partir do FIM da fila: o primeiro do lote sai um
 * sorteio depois da última mensagem pendente (ou da última enviada, se a fila
 * estava vazia), e cada seguinte um sorteio depois do anterior. Dois lotes
 * publicados em sequência não saem colados. A drenagem ainda confere o
 * espaçamento na hora de enviar (ver `drainOutbox`) — isto aqui é a projeção;
 * aquilo, a garantia.
 */
export async function enqueue(
  userIds: readonly string[],
  kind: WhatsappKind,
  options: EnqueueOptions = {},
): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;

  const now = options.now ?? new Date();
  const delay = options.delayMs ?? randomDelayMs;

  const [tail, lastSent] = await Promise.all([
    prisma.whatsappMessage.aggregate({ where: { status: "PENDENTE" }, _max: { sendAfter: true } }),
    prisma.whatsappMessage.aggregate({ where: { status: "ENVIADO" }, _max: { sentAt: true } }),
  ]);
  const anchor = tail._max.sendAfter ?? lastSent._max.sentAt;

  let cursor = anchor ? Math.max(now.getTime(), anchor.getTime() + delay()) : now.getTime();
  const data = unique.map((userId, index) => {
    if (index > 0) cursor += delay();
    return { userId, kind, sendAfter: new Date(cursor), text: options.text ?? null };
  });

  await prisma.whatsappMessage.createMany({ data });
  scheduleOutboxTick();
  return unique.length;
}

export interface DrainResult {
  enviados: number;
  falhas: number;
  /** Ficaram na fila: sem conexão, o lote acabou, ou ainda não é a hora. */
  pendentes: number;
  /** Das pendentes, quantas só esperam o horário sorteado. */
  aguardando: number;
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
  now?: Date;
}

// Uma drenagem por vez. O deploy é de instância única (documentado no
// .env.example), então uma trava de processo basta — duas drenagens
// simultâneas mandariam a mesma mensagem duas vezes.
let draining = false;

/**
 * Envia o que já venceu. Não dorme: a espera entre mensagens vive no banco.
 *
 * A cada envio, a próxima pendente é EMPURRADA para `agora + sorteio` se
 * estiver marcada para antes disso. É o que garante o ritmo mesmo quando a
 * projeção do enfileiramento ficou para trás — o WhatsApp passou horas
 * desconectado e a fila inteira venceu de uma vez, por exemplo: sai uma, e a
 * seguinte só depois do intervalo.
 */
export async function drainOutbox(options: DrainOptions = {}): Promise<DrainResult> {
  const limit = options.limit ?? 20;
  const delay = options.delayMs ?? randomDelayMs;
  const now = options.now ?? new Date();

  const situacao = async (): Promise<Pick<DrainResult, "pendentes" | "aguardando">> => {
    const [pendentes, aguardando] = await Promise.all([
      prisma.whatsappMessage.count({ where: { status: "PENDENTE" } }),
      prisma.whatsappMessage.count({ where: { status: "PENDENTE", sendAfter: { gt: now } } }),
    ]);
    return { pendentes, aguardando };
  };

  if (draining) return { enviados: 0, falhas: 0, ...(await situacao()) };
  if (!isEnabled() && !options.sender) {
    return { enviados: 0, falhas: 0, ...(await situacao()) };
  }

  draining = true;
  try {
    let sender = options.sender;
    let resolveJid = options.resolveJid;

    if (!sender || !resolveJid) {
      const sock = await getSocket();
      // Desconectado: a fila espera. Melhor atrasar do que marcar como falha
      // o que só precisa de conexão.
      if (!sock) return { enviados: 0, falhas: 0, ...(await situacao()) };

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

    let enviados = 0;
    let falhas = 0;
    // Cada mensagem é tentada uma vez por passada: a que falhou volta para a
    // fila, mas não para ESTA leitura — senão, com o relógio parado, ela seria
    // repescada em seguida e gastaria as três tentativas de uma vez.
    const tentadas: string[] = [];

    for (let vez = 0; vez < limit; vez += 1) {
      // Uma por vez, e não o lote de uma vez: o envio anterior pode ter
      // empurrado o horário da próxima, e ler tudo antes ignoraria isso.
      const msg = await prisma.whatsappMessage.findFirst({
        where: { status: "PENDENTE", sendAfter: { lte: now }, id: { notIn: tentadas } },
        orderBy: [{ sendAfter: "asc" }, { createdAt: "asc" }],
        select: MSG_SELECT,
      });
      if (!msg) break;
      tentadas.push(msg.id);

      const outcome = await attemptOne(msg, { sender, resolveJid, now, delay, requeue: true });
      if (outcome === "enviado") {
        enviados += 1;
        await spaceNext(msg.id, now, delay);
      } else if (outcome === "falhou") {
        falhas += 1;
      }
    }

    return { enviados, falhas, ...(await situacao()) };
  } finally {
    draining = false;
  }
}

const MSG_SELECT = {
  id: true,
  kind: true,
  userId: true,
  attempts: true,
  text: true,
  user: { select: { phone: true } },
} as const;

type QueuedMessage = {
  id: string;
  kind: WhatsappKind;
  userId: string;
  attempts: number;
  text: string | null;
  user: { phone: string | null };
};

type Outcome = "enviado" | "falhou" | "pendente";

/**
 * Uma tentativa de envio de UMA mensagem, com o registro do resultado.
 *
 * Compartilhada pela drenagem e pelo envio imediato: as regras de falha
 * (telefone ausente e número sem WhatsApp são definitivos; o resto tenta de
 * novo até MAX_ATTEMPTS) são as mesmas nos dois caminhos. `requeue` decide se
 * a falha passageira ganha um sorteio adiante (fila) ou fica vencida para a
 * próxima passada repescar (envio imediato).
 */
async function attemptOne(
  msg: QueuedMessage,
  deps: {
    sender: (jid: string, text: string) => Promise<void>;
    resolveJid: (candidates: string[]) => Promise<string | null>;
    now: Date;
    delay: () => number;
    requeue: boolean;
  },
): Promise<Outcome> {
  try {
    const candidates = jidCandidates(msg.user.phone);
    if (candidates.length === 0) {
      throw new PermanentFailure("Telefone ausente ou inválido no cadastro.");
    }

    const jid = await deps.resolveJid(candidates);
    if (!jid) throw new PermanentFailure("Este número não tem WhatsApp.");

    await deps.sender(jid, msg.text ?? MESSAGE_TEXT[msg.kind]);

    // updateMany, e não update: a linha pode ter sumido entre a leitura da
    // fila e agora — basta o destinatário ser excluído do sistema, e o
    // cascade leva a mensagem junto. `update` LANÇA quando não acha, e o
    // erro escaparia do laço abortando os envios restantes; `updateMany`
    // sobre zero linhas simplesmente não faz nada.
    await prisma.whatsappMessage.updateMany({
      where: { id: msg.id },
      data: { status: "ENVIADO", sentAt: deps.now, attempts: msg.attempts + 1, error: null },
    });
    return "enviado";
  } catch (e) {
    // A falha de um destinatário NÃO interrompe os demais. É por isso que
    // o try/catch está em volta de UMA mensagem, e não do laço.
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
        // Falha passageira volta para a fila, um sorteio adiante — repetir
        // na mesma passada seria martelar. Só se desiste depois de
        // MAX_ATTEMPTS ou quando repetir não tem como dar certo.
        status: desistir ? "FALHOU" : "PENDENTE",
        sendAfter: desistir || !deps.requeue ? undefined : new Date(deps.now.getTime() + deps.delay()),
        attempts: tentativas,
        error: motivo,
      },
    });
    // userId, nunca o telefone.
    console.error(`[whatsapp] falha ao enviar ${msg.kind} para ${msg.userId}: ${motivo}`);
    return desistir ? "falhou" : "pendente";
  }
}

export interface SendNowOptions {
  /** Injetados no teste. Em produção saem do socket real. */
  sender?: (jid: string, text: string) => Promise<void>;
  resolveJid?: (candidates: string[]) => Promise<string | null>;
  now?: Date;
}

export interface SendNowResult {
  enviados: number;
  falhas: number;
}

/**
 * Envio IMEDIATO, fora da fila — o caminho do chamado de TI.
 *
 * Sem sorteio nem espera: quem abre um chamado precisa de atendimento agora,
 * e um aviso que chega duas horas depois não é aviso. O preço é o risco de
 * rajada, aceito de propósito para este tipo — os demais continuam na fila.
 *
 * A linha em `WhatsappMessage` nasce com `sendAfter = agora` e o envio é
 * tentado em seguida. Se o WhatsApp estiver desligado ou desconectado, ou a
 * falha for passageira, ela fica PENDENTE e vencida: a fila normal a repesca
 * na próxima passada. O registro por destinatário é o mesmo da fila.
 */
export async function sendNow(
  userIds: readonly string[],
  kind: WhatsappKind,
  text: string,
  options: SendNowOptions = {},
): Promise<SendNowResult> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return { enviados: 0, falhas: 0 };
  const now = options.now ?? new Date();

  await prisma.whatsappMessage.createMany({
    data: unique.map((userId) => ({ userId, kind, text, sendAfter: now })),
  });

  let sender = options.sender;
  let resolveJid = options.resolveJid;
  if (!sender || !resolveJid) {
    const sock = isEnabled() ? await getSocket() : null;
    if (!sock) {
      // Fica na fila, vencida. A drenagem manda quando houver conexão.
      scheduleOutboxTick();
      return { enviados: 0, falhas: 0 };
    }
    sender =
      sender ??
      (async (jid, txt) => {
        await sock.sendMessage(jid, { text: txt });
      });
    resolveJid =
      resolveJid ??
      (async (candidates) => {
        const found = await sock.onWhatsApp(...candidates);
        return found?.find((f) => f.exists)?.jid ?? null;
      });
  }

  const msgs = await prisma.whatsappMessage.findMany({
    where: { userId: { in: unique }, kind, status: "PENDENTE", sendAfter: now, text },
    select: MSG_SELECT,
  });

  let enviados = 0;
  let falhas = 0;
  for (const msg of msgs) {
    const outcome = await attemptOne(msg, {
      sender,
      resolveJid,
      now,
      delay: randomDelayMs,
      requeue: false,
    });
    if (outcome === "enviado") enviados += 1;
    else if (outcome === "falhou") falhas += 1;
  }
  if (msgs.length > enviados + falhas) scheduleOutboxTick();
  return { enviados, falhas };
}

/**
 * Depois de um envio, nada mais sai antes de um sorteio adiante: toda pendente
 * marcada para antes disso é empurrada para lá. As que já estavam marcadas
 * para mais tarde ficam como estão. Quando várias caem no mesmo horário, a
 * ordem de criação desempata — e a próxima passada empurra as demais de novo.
 */
async function spaceNext(sentId: string, now: Date, delay: () => number): Promise<void> {
  const earliest = new Date(now.getTime() + delay());
  await prisma.whatsappMessage.updateMany({
    where: { status: "PENDENTE", id: { not: sentId }, sendAfter: { lt: earliest } },
    data: { sendAfter: earliest },
  });
}

// ─────────────────────────────────────────────────────────────
// Agendador do processo
// ─────────────────────────────────────────────────────────────
//
// Quem chama a drenagem quando a próxima mensagem vence? Não pode ser a
// requisição que enfileirou (ela já respondeu), e o cron externo é opcional
// e esparso. Então é o próprio processo: um `setTimeout` desreferenciado que
// acorda quando a próxima pendente vence — nunca antes de 5 s, nunca depois
// de 60 s — e se cala quando a fila esvazia. O deploy é de instância única
// (documentado no .env.example), então um temporizador por processo basta.
//
// Quem o acorda: a subida do servidor (instrumentation.ts, para a fila que
// sobreviveu a um restart), cada enfileiramento e o cron.

const TICK_MIN_MS = 5_000;
const TICK_MAX_MS = 60_000;

let tickTimer: NodeJS.Timeout | null = null;
let ticking = false;
/** Alguém pediu uma passada enquanto outra rodava: rodar de novo ao fim. */
let tickAgain = false;

export function scheduleOutboxTick(delayMs = 0): void {
  if (tickTimer) return;
  tickTimer = setTimeout(() => {
    tickTimer = null;
    void tick();
  }, delayMs);
  // Não segura o processo vivo só por causa da espera.
  tickTimer.unref?.();
}

async function tick(): Promise<void> {
  if (ticking) {
    tickAgain = true;
    return;
  }
  ticking = true;
  try {
    // Desligado (sem WHATSAPP_ENABLED): não há o que drenar, e ficar acordando
    // a cada minuto para descobrir isso é ruído. O próximo enfileiramento
    // tenta de novo.
    if (!isEnabled()) return;

    const res = await drainOutbox({ limit: 20 });
    if (res.pendentes === 0) return;

    const next = await prisma.whatsappMessage.findFirst({
      where: { status: "PENDENTE" },
      orderBy: { sendAfter: "asc" },
      select: { sendAfter: true },
    });
    const wait = next ? next.sendAfter.getTime() - Date.now() : TICK_MAX_MS;
    scheduleOutboxTick(Math.min(TICK_MAX_MS, Math.max(TICK_MIN_MS, wait)));
  } catch (e) {
    // Fora de requisição não há ninguém acima para pegar isto. Loga e tenta
    // de novo mais tarde — a fila continua no banco.
    console.error("[whatsapp] agendador da fila:", e);
    scheduleOutboxTick(TICK_MAX_MS);
  } finally {
    ticking = false;
    if (tickAgain) {
      tickAgain = false;
      scheduleOutboxTick();
    }
  }
}
