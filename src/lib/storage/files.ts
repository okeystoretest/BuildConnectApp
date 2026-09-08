import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveUploadDir, toPublicPath, type UploadCategory } from "./config";
import { MAX_BYTES } from "./limits";

/**
 * Armazenamento de arquivos que NÃO são imagem (vídeos, PDFs, planilhas,
 * documentos). Sem sharp — grava o binário direto no disco particionado
 * por ano/mês e devolve o caminho público. O banco guarda só o caminho.
 *
 * Imagens continuam passando por images.ts (tratamento + .webp).
 */

// Tipos aceitos por categoria de conteúdo, com teto de tamanho.
// `extensions` cobre formatos cujo MIME o navegador não envia (.srt/.vtt).
// Os tetos vêm de ./limits, que o navegador também importa: conferir antes de
// enviar é o que evita minutos de espera terminando em erro genérico.
const RULES: Record<
  "video" | "document" | "pdf" | "instruction" | "transcript",
  { mimes: Set<string>; extensions?: Set<string>; maxBytes: number; label: string }
> = {
  video: {
    mimes: new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]),
    maxBytes: MAX_BYTES.video,
    label: "Vídeo",
  },
  document: {
    mimes: new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "image/png",
    ]),
    maxBytes: MAX_BYTES.document,
    label: "Documento",
  },
  pdf: {
    mimes: new Set(["application/pdf"]),
    maxBytes: MAX_BYTES.pdf,
    label: "PDF",
  },
  // Documento anexo "Instrução Escrita" de um vídeo — abre em nova aba.
  instruction: {
    mimes: new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ]),
    extensions: new Set([".pdf", ".doc", ".docx"]),
    maxBytes: MAX_BYTES.instruction,
    label: "Instrução escrita",
  },
  // Transcrição do vídeo — texto puro, legendas .vtt ou .srt.
  transcript: {
    mimes: new Set(["text/plain", "text/vtt", "text/markdown", "application/x-subrip"]),
    extensions: new Set([".txt", ".vtt", ".srt", ".md"]),
    maxBytes: MAX_BYTES.transcript,
    label: "Transcrição",
  },
};

/**
 * Extensões aceitas por regra.
 *
 * O MIME (file.type) vem do header da parte multipart — quem envia escolhe o
 * valor. Aceitar só o MIME permitia gravar "payload.svg" declarando
 * "image/png": o arquivo era servido depois como image/svg+xml, na origem da
 * aplicação, e SVG executa script. A extensão real passa a ser conferida
 * SEMPRE, e é ela que nomeia o arquivo no disco.
 */
const RULE_EXTENSIONS: Record<keyof typeof RULES, ReadonlySet<string>> = {
  video: new Set([".mp4", ".webm", ".mov", ".mkv"]),
  document: new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png"]),
  pdf: new Set([".pdf"]),
  instruction: new Set([".pdf", ".doc", ".docx"]),
  transcript: new Set([".txt", ".vtt", ".srt", ".md"]),
};

export class FileStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStorageError";
  }
}

/**
 * Falha de DISCO, não do arquivo enviado.
 *
 * O erro real (EACCES, ENOSPC, volume não montado) vai para o log; o usuário
 * recebe um texto que aponta para onde o conserto está. A mensagem genérica
 * anterior fazia procurar defeito no arquivo quando o problema era permissão
 * na pasta de uploads.
 */
const ERRO_DE_DISCO =
  "Não foi possível gravar o arquivo no servidor. Avise a TI: pode ser permissão na pasta de uploads.";

export interface StoredFile {
  publicPath: string;
  absolutePath: string;
  sizeBytes: number;
  originalName: string;
}

/** Extensão preservada a partir do nome original (sanitizada). */
function safeExtension(name: string): string {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext && ext.length <= 6 ? ext : "";
}

export async function storeFile(
  file: File,
  rule: keyof typeof RULES,
  category: UploadCategory,
): Promise<StoredFile> {
  const { mimes, extensions, maxBytes, label } = RULES[rule];

  // Alguns formatos chegam sem MIME (ou com MIME genérico) do navegador;
  // a extensão sanitizada é o fallback aceito.
  const extension = safeExtension(file.name);

  // Primeiro corte: a extensão precisa estar na allowlist da regra, sempre.
  if (!RULE_EXTENSIONS[rule].has(extension)) {
    throw new FileStorageError(`Extensão inválida para ${label.toLowerCase()}.`);
  }

  const validMime = mimes.has(file.type);
  const validExtension = Boolean(extensions?.has(extension));
  if (!validMime && !validExtension) {
    throw new FileStorageError(`Formato inválido para ${label.toLowerCase()}.`);
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new FileStorageError(`${label} acima de ${mb} MB.`);
  }

  const dir = resolveUploadDir(category);

  // Nome novo com a extensão JÁ validada acima.
  const filename = `${crypto.randomBytes(16).toString("hex")}${extension}`;
  const absolutePath = path.join(dir, filename);

  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    console.error("[storeFile] mkdir", dir, error);
    throw new FileStorageError(ERRO_DE_DISCO);
  }

  // Streaming, e não `Buffer.from(await file.arrayBuffer())`.
  //
  // O arrayBuffer materializava o arquivo INTEIRO numa segunda cópia: um vídeo
  // de 500 MB pedia perto de 1 GB de RSS, somado ao corpo que o Next já
  // bufferizou para montar o FormData. Num contêiner pequeno isso basta para o
  // kernel matar o processo — e processo morto derruba a aplicação para todo
  // mundo, não só para quem estava enviando.
  //
  // O corpo bufferizado pelo Next continua existindo; o que sai daqui é a
  // segunda cópia. Eliminar o resto exige tirar o upload de Server Action.
  try {
    await pipeline(
      // Os tipos web do DOM e os de node:stream/web descrevem o mesmo objeto
      // em runtime; o cast é o mesmo que app/uploads faz no sentido oposto.
      Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(absolutePath),
    );
  } catch (error) {
    // Escrita interrompida no meio deixa um arquivo parcial no volume. Quem
    // chama só registra o caminho para rollback DEPOIS que esta função
    // retorna, então aquele rollback nunca veria este arquivo: a limpeza tem
    // de acontecer aqui.
    await unlink(absolutePath).catch(() => {});
    console.error("[storeFile] gravação em", absolutePath, error);
    throw new FileStorageError(ERRO_DE_DISCO);
  }

  // O tamanho vem do que foi REALMENTE gravado, e não de file.size: ele é
  // persistido e exibido ("2.4 MB") nas telas de documentos e de progresso.
  const { size } = await stat(absolutePath);

  return {
    publicPath: toPublicPath(absolutePath),
    absolutePath,
    sizeBytes: size,
    originalName: file.name,
  };
}

/** Remove um arquivo do disco pelo caminho absoluto (best-effort). */
export async function removeFile(absolutePath: string): Promise<void> {
  await unlink(absolutePath).catch(() => {});
}

/**
 * Extrai o texto exibível de um arquivo de transcrição. Aceita texto puro,
 * .md, .vtt e .srt — nos dois últimos, descarta cabeçalho, numeração de
 * blocos e marcações de tempo, sobrando só a fala.
 */
export async function extractTranscriptText(file: File): Promise<string> {
  const raw = Buffer.from(await file.arrayBuffer()).toString("utf-8");
  const extension = safeExtension(file.name);

  if (extension !== ".vtt" && extension !== ".srt") {
    return raw.replace(/\r\n/g, "\n").trim();
  }

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const speech: string[] = [];
  for (const line of lines) {
    const value = line.trim();
    if (!value) {
      if (speech.length > 0 && speech[speech.length - 1] !== "") speech.push("");
      continue;
    }
    if (value === "WEBVTT" || value.startsWith("NOTE ")) continue;
    if (/^\d+$/.test(value)) continue;
    if (value.includes("-->")) continue;
    speech.push(value.replace(/<[^>]+>/g, ""));
  }
  return speech.join("\n").trim();
}
