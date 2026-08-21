import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import {
  resolveUploadDir,
  toPublicPath,
  type UploadCategory,
} from "./config";

/**
 * Tratamento de imagens antes de gravar no disco.
 *
 * Regra inegociável do projeto: toda foto enviada (celular do motorista,
 * avatar, conteúdo) passa por aqui. O sharp redimensiona, reduz qualidade
 * e OBRIGATORIAMENTE converte para .webp — economiza o disco da VPS e
 * acelera o carregamento. O banco recebe só o caminho público retornado.
 */

/** Tipos aceitos na entrada (espelha o validador do cliente). */
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** Teto de entrada por arquivo. */
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ProcessOptions {
  /** Maior dimensão permitida (px). Acima disso, redimensiona proporcional. */
  maxDimension?: number;
  /** Qualidade webp (1–100). */
  quality?: number;
}

const DEFAULTS: Required<ProcessOptions> = {
  maxDimension: 1600,
  quality: 72,
};

export interface ProcessedImage {
  /** Caminho público para salvar no banco (ex.: /uploads/chamados/2026/06/x.webp). */
  publicPath: string;
  /** Caminho físico absoluto no disco. */
  absolutePath: string;
  /** Tamanho final em bytes. */
  sizeBytes: number;
}

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

function randomName(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Processa um único arquivo e grava no disco. Lança ImageProcessingError
 * em entradas inválidas — o chamador traduz para mensagem ao usuário.
 */
export async function processAndStoreImage(
  file: File,
  category: UploadCategory,
  options: ProcessOptions = {},
): Promise<ProcessedImage> {
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new ImageProcessingError(
      "Formato inválido. Envie JPG, PNG, WebP ou HEIC.",
    );
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageProcessingError("Imagem acima de 10 MB.");
  }

  const { maxDimension, quality } = { ...DEFAULTS, ...options };
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let output: Buffer;
  try {
    output = await sharp(inputBuffer, { failOn: "error" })
      // Corrige orientação vinda do EXIF (fotos de celular deitam sem isso).
      .rotate()
      // Só reduz; nunca amplia imagem pequena.
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();
  } catch {
    throw new ImageProcessingError("Não foi possível processar a imagem.");
  }

  const dir = resolveUploadDir(category);
  await mkdir(dir, { recursive: true });

  const absolutePath = path.join(dir, `${randomName()}.webp`);
  await writeFile(absolutePath, output);

  return {
    publicPath: toPublicPath(absolutePath),
    absolutePath,
    sizeBytes: output.length,
  };
}

/**
 * Processa vários arquivos. Best-effort transacional: se algum falhar,
 * remove os que já haviam sido gravados e propaga o erro — evita órfãos
 * no disco quando a operação de conjunto não pode ser concluída.
 */
export async function processAndStoreImages(
  files: readonly File[],
  category: UploadCategory,
  options: ProcessOptions = {},
): Promise<ProcessedImage[]> {
  const stored: ProcessedImage[] = [];
  try {
    for (const file of files) {
      stored.push(await processAndStoreImage(file, category, options));
    }
    return stored;
  } catch (error) {
    // Rollback físico dos já gravados.
    const { unlink } = await import("node:fs/promises");
    await Promise.allSettled(stored.map((img) => unlink(img.absolutePath)));
    throw error;
  }
}
