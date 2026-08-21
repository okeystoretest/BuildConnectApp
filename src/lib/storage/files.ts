import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveUploadDir, toPublicPath, type UploadCategory } from "./config";

/**
 * Armazenamento de arquivos que NÃO são imagem (vídeos, PDFs, planilhas,
 * documentos). Sem sharp — grava o binário direto no disco particionado
 * por ano/mês e devolve o caminho público. O banco guarda só o caminho.
 *
 * Imagens continuam passando por images.ts (tratamento + .webp).
 */

// Tipos aceitos por categoria de conteúdo, com teto de tamanho.
// `extensions` cobre formatos cujo MIME o navegador não envia (.srt/.vtt).
const RULES: Record<
  "video" | "document" | "pdf" | "instruction" | "transcript",
  { mimes: Set<string>; extensions?: Set<string>; maxBytes: number; label: string }
> = {
  video: {
    mimes: new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]),
    maxBytes: 500 * 1024 * 1024, // 500 MB
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
    maxBytes: 50 * 1024 * 1024, // 50 MB
    label: "Documento",
  },
  pdf: {
    mimes: new Set(["application/pdf"]),
    maxBytes: 30 * 1024 * 1024, // 30 MB
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
    maxBytes: 30 * 1024 * 1024, // 30 MB
    label: "Instrução escrita",
  },
  // Transcrição do vídeo — texto puro, legendas .vtt ou .srt.
  transcript: {
    mimes: new Set(["text/plain", "text/vtt", "text/markdown", "application/x-subrip"]),
    extensions: new Set([".txt", ".vtt", ".srt", ".md"]),
    maxBytes: 2 * 1024 * 1024, // 2 MB
    label: "Transcrição",
  },
};

export class FileStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStorageError";
  }
}

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
  await mkdir(dir, { recursive: true });

  const filename = `${crypto.randomBytes(16).toString("hex")}${safeExtension(file.name)}`;
  const absolutePath = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return {
    publicPath: toPublicPath(absolutePath),
    absolutePath,
    sizeBytes: buffer.length,
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
