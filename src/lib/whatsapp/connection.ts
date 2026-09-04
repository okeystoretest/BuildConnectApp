import makeWASocket, { Browsers, DisconnectReason } from "baileys";
import type { WASocket } from "baileys";
import QRCode from "qrcode";
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
    void connect();
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
    void saveCreds();
  });

  socket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state = "aguardando_qr";
      void QRCode.toDataURL(qr).then((url) => {
        qrDataUrl = url;
      });
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
        void clearAuthState();
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
