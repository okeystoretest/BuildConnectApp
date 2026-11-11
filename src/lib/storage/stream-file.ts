import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { UPLOADS_ROOT } from "./config";

/**
 * Entrega de arquivo do disco por HTTP: tipo, cabeçalhos e Range.
 *
 * Extraído de `app/uploads/[...path]/route.ts` quando a Página de Integração
 * passou a precisar servir filme e PDF a quem NÃO tem sessão. O portão dela é
 * outro — token de convite e peça registrada, nada de `getCurrentUser` — e
 * misturar as duas autorizações na mesma rota era arriscar que um descuido no
 * portão do convidado abrisse o acervo inteiro.
 *
 * Então a autorização se separou e a ENTREGA continuou uma só. É o que evita
 * duas implementações de Range divergindo: a que toca vídeo com seek e a que,
 * meses depois, alguém esqueceu de corrigir.
 *
 * Este módulo não decide acesso. Quem chama já decidiu.
 */

// ".svg" está fora de propósito: SVG é documento ativo (executa script) e
// nenhum fluxo do sistema grava SVG. Fora do mapa, cai em octet-stream e o
// navegador baixa em vez de renderizar.
const CONTENT_TYPE: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".srt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * Resolve o caminho físico com barreira contra travessia de diretório.
 * Qualquer coisa que escape de UPLOADS_ROOT devolve null — inclusive `..`
 * codificado, porque a comparação é feita no caminho já normalizado.
 */
export function resolveSafePath(segments: string[]): string | null {
  if (segments.length === 0) return null;
  const decoded = segments.map((s) => decodeURIComponent(s));
  if (decoded.some((s) => !s || s === "." || s === ".." || s.includes("\0"))) return null;

  const root = path.resolve(UPLOADS_ROOT);
  const target = path.resolve(root, ...decoded);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

/** Converte um caminho público (/uploads/a/b.mp4) nos segmentos físicos. */
export function segmentsFromPublicPath(publicPath: string): string[] {
  return publicPath.replace(/^\/uploads\//, "").split("/").filter(Boolean);
}

function nodeToWeb(stream: NodeJS.ReadableStream): ReadableStream {
  // Readable.toWeb existe no Node 18+; o cast evita depender do tipo do DOM.
  return Readable.toWeb(stream as Readable) as unknown as ReadableStream;
}

export interface StreamOptions {
  /**
   * `no-store` para material sensível: um ano de cache deixa o arquivo no
   * disco do navegador e de lá ele reabre sem passar por portão nenhum —
   * inclusive depois de a pessoa perder o acesso.
   */
  cacheControl: string;
}

/**
 * Responde com o arquivo, honrando Range para que vídeo grande toque com seek
 * em vez de ser baixado inteiro antes do primeiro frame.
 *
 * Devolve 404 quando o caminho não é arquivo — e de propósito não distingue
 * "não existe" de "não é arquivo": quem chama não precisa saber, e quem sonda
 * também não.
 */
export async function streamFile(
  request: Request,
  filePath: string,
  { cacheControl }: StreamOptions,
): Promise<Response> {
  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = CONTENT_TYPE[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  // Anexo (download) para o que o navegador não deve renderizar: formatos do
  // Office e binário desconhecido. Imagem, vídeo, PDF e texto continuam
  // abrindo na aba. O que tornava isso perigoso era SVG, que agora nem é
  // gravado (storage/files.ts) nem tem Content-Type aqui. "nosniff" fecha o
  // resto: impede o navegador de adivinhar um tipo executável.
  const inline =
    type.startsWith("image/") ||
    type.startsWith("video/") ||
    type.startsWith("text/") ||
    type === "application/pdf";

  const baseHeaders: Record<string, string> = {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": inline ? "inline" : "attachment",
    "Cache-Control": cacheControl,
    "Accept-Ranges": "bytes",
  };

  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

  if (match) {
    const startRaw = match[1];
    const endRaw = match[2];

    // "bytes=-500" = últimos 500 bytes.
    let start = startRaw ? Number(startRaw) : size - Number(endRaw || 0);
    let end = startRaw ? (endRaw ? Number(endRaw) : size - 1) : size - 1;

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return new Response("Range inválido", { status: 416 });
    }
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      return new Response("Range inválido", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    return new Response(nodeToWeb(createReadStream(filePath, { start, end })), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(nodeToWeb(createReadStream(filePath)), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
