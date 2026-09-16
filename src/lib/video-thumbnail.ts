"use client";

/**
 * Captura um quadro do vídeo NO NAVEGADOR e devolve um JPEG.
 *
 * O servidor não tem ffmpeg, e instalar um decodificador de vídeo só para
 * tirar um quadro seria pesado demais. O navegador já decodifica o arquivo
 * para tocar — então é ele quem tira a foto: um `<video>` fora da tela pula
 * para o instante escolhido, o quadro vai para um `<canvas>` e sai como Blob.
 *
 * Devolve `null` quando o navegador não consegue decodificar o arquivo (é o
 * caso de codecs que ele não suporta, comum em .mkv). O vídeo sobe do mesmo
 * jeito, só que sem miniatura — o card mostra o placeholder.
 */

/** Largura máxima da miniatura. 640 px é o dobro do card na grade em 3 colunas. */
const MAX_WIDTH = 640;
/** Um quadro antes disso costuma ser tela preta de abertura. */
const SEEK_SECONDS = 1;
/** Vídeos que não carregam metadados nesse tempo são dados como indecodificáveis. */
const TIMEOUT_MS = 8000;

export async function captureVideoThumbnail(file: File): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    return await new Promise<Blob | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      const fail = () => {
        clearTimeout(timer);
        resolve(null);
      };

      video.onerror = fail;
      video.onloadedmetadata = () => {
        // Vídeo mais curto que o ponto de captura: pega o meio.
        const target = Math.min(SEEK_SECONDS, Math.max(0, (video.duration || 0) / 2));
        video.currentTime = target;
      };
      video.onseeked = () => {
        clearTimeout(timer);
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return resolve(null);

        const scale = Math.min(1, MAX_WIDTH / width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);

        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
        } catch {
          resolve(null);
        }
      };
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
