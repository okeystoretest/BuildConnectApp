import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { UPLOADS_ROOT } from "@/lib/storage/config";

/**
 * Servidor dos arquivos enviados (`/uploads/...`).
 *
 * Por que existe: o banco guarda só o caminho público e os binários ficam em
 * `UPLOADS_DIR`, FORA de `public/` — logo, fora do que o Next serve sozinho.
 * Num deploy com Nginx próprio bastava um `alias`; rodando em container
 * (Easy Panel), o proxy não enxerga esse diretório. Esta rota fecha o buraco
 * sem mudar uma linha do resto do sistema: os caminhos salvos no banco
 * continuam valendo.
 *
 * Suporta Range para que vídeo grande toque com seek, em vez de ser baixado
 * inteiro antes do primeiro frame.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPE: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
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
};

/**
 * Resolve o caminho físico com barreira contra travessia de diretório.
 * Qualquer coisa que escape de UPLOADS_ROOT devolve null — inclusive `..`
 * codificado, porque a comparação é feita no caminho já normalizado.
 */
function resolveSafePath(segments: string[]): string | null {
  if (segments.length === 0) return null;
  const decoded = segments.map((s) => decodeURIComponent(s));
  if (decoded.some((s) => !s || s === "." || s === ".." || s.includes("\0"))) return null;

  const root = path.resolve(UPLOADS_ROOT);
  const target = path.resolve(root, ...decoded);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

function nodeToWeb(stream: NodeJS.ReadableStream): ReadableStream {
  // Readable.toWeb existe no Node 18+; o cast evita depender do tipo do DOM.
  return Readable.toWeb(stream as Readable) as unknown as ReadableStream;
}

export async function GET(
  request: Request,
  { params }: { params: { path: string[] } },
) {
  const filePath = resolveSafePath(params.path ?? []);
  if (!filePath) return new Response("Not found", { status: 404 });

  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = CONTENT_TYPE[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  // Nomes de arquivo são aleatórios e nunca reaproveitados: cache agressivo.
  const baseHeaders: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
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
