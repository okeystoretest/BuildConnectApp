import makeWASocket, { Browsers, DisconnectReason } from "baileys";
import type { WASocket } from "baileys";
import QRCode from "qrcode";
import { describeError } from "@/lib/describe-error";
import { clearAuthState, hasStoredCredentials, loadDbAuthState } from "./auth-state";

/**
 * Conexão única com o WhatsApp.
 *
 * Singleton de processo, e não por requisição: o Baileys mantém um WebSocket
 * vivo e uma sessão que só admite um aparelho por vez. Abrir um socket por
 * chamada faria duas conexões disputarem a mesma credencial, e o WhatsApp
 * derruba as duas.
 *
 * TUDO que fala com o Baileys passa por aqui. É o que torna barato migrar para
 * a linha 7.x quando o protocolo mudar — um arquivo, não cinco.
 */

export type ConnectionState =
  | "desligado"
  | "desconectado"
  | "conectando"
  | "aguardando_qr"
  | "conectado";

export interface ConnectionInfo {
  state: ConnectionState;
  /** QR em data URL, pronto para <img>. Só quando aguardando pareamento. */
  qr?: string;
  /** Número vinculado, para o admin saber qual chip está ativo. */
  number?: string;
  /** Motivo da última queda, em português. */
  lastError?: string;
}

/** Sem isto ligado, nada conecta — nem no build, nem em desenvolvimento. */
export function isEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

let sock: WASocket | null = null;
let state: ConnectionState = "desconectado";
let qrDataUrl: string | undefined;
let connectedNumber: string | undefined;
let lastError: string | undefined;
let starting: Promise<void> | null = null;
let attempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;

/**
 * Reconectar ou não, a partir do código da desconexão.
 *
 * Puro para ter teste: é a decisão que, errada, custa caro nos dois sentidos.
 * Insistir num `loggedOut` é martelar uma sessão que não existe mais; desistir
 * num `restartRequired` é ficar mudo esperando alguém perceber.
 */
export function shouldReconnect(statusCode: number | undefined): boolean {
  // Deslogado ou banido: só um QR novo resolve. Reconectar não adianta.
  if (statusCode === DisconnectReason.loggedOut) return false;
  if (statusCode === DisconnectReason.forbidden) return false;
  // Outro aparelho assumiu a sessão. Voltar seria empurrar o outro para fora,
  // e os dois ficariam se derrubando em looping.
  if (statusCode === DisconnectReason.connectionReplaced) return false;
  return true;
}

/** Recuo exponencial com teto, para não martelar o servidor do WhatsApp. */
function delayFor(attempt: number): number {
  return Math.min(5_000 * 2 ** Math.min(attempt, 5), 5 * 60_000);
}

/**
 * Registra falha de promessa que roda FORA do ciclo de requisição.
 *
 * Tudo neste arquivo que fala com o banco ou com o socket é disparado por
 * event handler do Baileys ou por `setTimeout` — lugares onde não existe
 * requisição por cima para pegar a rejeição. E no Node ≥ 15 rejeição sem
 * tratamento não é aviso: encerra o processo com código 1. Uma escrita de
 * credencial que falha durante um pico do Postgres derrubaria a intranet
 * inteira, para quem nem usa WhatsApp.
 *
 * O nome do lugar vai no texto porque as quatro origens degradam de formas
 * diferentes, e o log é a única testemunha: sem ele, sobra um processo vivo
 * que parou de fazer uma coisa específica, sem dizer qual.
 */
function logBackgroundFailure(onde: string, erro: unknown): void {
  console.error(`[whatsapp] falha em segundo plano — ${onde}: ${describeError(erro)}`);
}

/**
 * Logger mudo.
 *
 * O padrão do Baileys despeja o tráfego — inclusive material de sessão — no
 * stdout. Num container, isso vai para o log do Easy Panel e fica lá.
 */
const silentLogger = {
  level: "silent",
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child() {
    return silentLogger;
  },
};

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const wait = delayFor(attempts);
  attempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // `connect()` rejeita quando `loadDbAuthState()` não consegue ler o
    // Postgres. Aqui não há requisição por cima: sem este catch, o banco
    // piscando durante uma tentativa de reconexão mata o processo.
    //
    // Reagendar não vira laço apertado: `scheduleReconnect` incrementa
    // `attempts` a cada passagem e `delayFor` sobe até o teto de 5 minutos.
    connect().catch((erro) => {
      logBackgroundFailure("reconexão agendada", erro);
      state = "desconectado";
      lastError = "Falha ao reconectar. Nova tentativa em instantes.";
      scheduleReconnect();
    });
  }, wait);
  // Não segura o processo vivo só por causa da espera.
  reconnectTimer.unref?.();
}

async function connect(): Promise<void> {
  if (!isEnabled()) {
    state = "desligado";
    return;
  }
  if (sock) return;

  state = "conectando";
  const { state: auth, saveCreds } = await loadDbAuthState();

  const socket = makeWASocket({
    auth,
    // O QR é entregue pela tela de administração, não pelo terminal: num
    // container, ninguém vai atrás dele no log para parear.
    printQRInTerminal: false,
    browser: Browsers.appropriate("Build.Connect"),
    logger: silentLogger as never,
    // Nada de marcar o app como online: isso faria o WhatsApp parar de enviar
    // notificação para o CELULAR de quem opera o chip.
    markOnlineOnConnect: false,
  });
  sock = socket;

  socket.ev.on("creds.update", () => {
    // A rotação de credencial acontece SOZINHA, várias vezes por sessão, e
    // grava no Postgres. Era a rejeição mais provável das quatro justamente
    // por ser a mais frequente — e a que mais chance tinha de coincidir com um
    // upload longo em curso.
    //
    // Perder uma gravação não é fatal: a credencial em memória segue válida e
    // a próxima rotação tenta de novo. Fatal seria derrubar o processo.
    saveCreds().catch((erro) => logBackgroundFailure("gravação de credencial", erro));
  });

  socket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state = "aguardando_qr";
      // Sem o catch, um QR malformado derrubaria a aplicação inteira por causa
      // de uma tela de administração. O WhatsApp reemite o QR a cada ~20 s, e
      // a próxima emissão tenta de novo: o custo real é a tela ficar sem
      // imagem por uma rodada.
      QRCode.toDataURL(qr)
        .then((url) => {
          qrDataUrl = url;
        })
        .catch((erro) => logBackgroundFailure("geração do QR", erro));
    }

    if (connection === "open") {
      state = "conectado";
      qrDataUrl = undefined;
      lastError = undefined;
      attempts = 0;
      // `id` vem como "5511987654321:12@s.whatsapp.net" — só o número
      // interessa, e ele é exibido apenas a quem administra usuários.
      connectedNumber = socket.user?.id?.split(":")[0] ?? undefined;
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      sock = null;
      connectedNumber = undefined;

      if (code === DisconnectReason.loggedOut) {
        // O aparelho foi desvinculado pelo celular. A credencial guardada não
        // vale mais para nada, e mantê-la só faria a próxima tentativa falhar
        // igual — apagar é o que devolve o QR.
        lastError = "Sessão encerrada no celular. Escaneie o QR novamente.";
        state = "desconectado";
        // Apagar é o que devolve o QR, mas falhar em apagar não pode derrubar
        // o processo. Se a limpeza não for, o admin ainda tem o botão de
        // desvincular (`resetSession`) para forçar de novo.
        clearAuthState().catch((erro) => logBackgroundFailure("limpeza da credencial", erro));
        return;
      }

      lastError = describe(code);
      if (shouldReconnect(code)) {
        state = "conectando";
        scheduleReconnect();
      } else {
        state = "desconectado";
      }
    }
  });
}

function describe(code: number | undefined): string {
  switch (code) {
    case DisconnectReason.forbidden:
      return "Número bloqueado pelo WhatsApp.";
    case DisconnectReason.connectionReplaced:
      return "Outra sessão assumiu este número.";
    case DisconnectReason.badSession:
      return "Sessão corrompida. Desvincule e pareie de novo.";
    case DisconnectReason.restartRequired:
      return "Reinício exigido pelo WhatsApp. Reconectando.";
    case DisconnectReason.timedOut:
      return "Tempo esgotado. Reconectando.";
    default:
      return "Conexão perdida. Reconectando.";
  }
}

/**
 * Garante a conexão, sem abrir duas.
 *
 * A promessa em `starting` é o que impede duas chamadas simultâneas de criarem
 * dois sockets — que é o cenário que derruba a sessão.
 */
export async function ensureConnection(): Promise<void> {
  if (!isEnabled() || sock) return;
  if (!starting) {
    starting = connect().finally(() => {
      starting = null;
    });
  }
  return starting;
}

/** Socket pronto para enviar, ou null. Nunca lança. */
export async function getSocket(): Promise<WASocket | null> {
  await ensureConnection();
  return state === "conectado" ? sock : null;
}

export async function connectionInfo(): Promise<ConnectionInfo> {
  if (!isEnabled()) return { state: "desligado" };
  await ensureConnection();
  // Sem credencial e sem QR ainda, o estado honesto é "conectando": o QR
  // chega em segundos e dizer "desconectado" faria a tela parecer quebrada.
  const pareado = await hasStoredCredentials();
  return {
    state: state === "desconectado" && !pareado ? "conectando" : state,
    qr: qrDataUrl,
    number: connectedNumber,
    lastError,
  };
}

/**
 * Desvincula: derruba o socket e apaga a credencial.
 *
 * É a operação de trocar de número — depois dela, o próximo `ensureConnection`
 * gera um QR novo.
 */
export async function resetSession(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    await sock?.logout();
  } catch {
    // O celular pode já ter desvinculado. Não impede a limpeza local.
  }
  sock = null;
  state = "desconectado";
  qrDataUrl = undefined;
  connectedNumber = undefined;
  lastError = undefined;
  attempts = 0;
  await clearAuthState();
}
