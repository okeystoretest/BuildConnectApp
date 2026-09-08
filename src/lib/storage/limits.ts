import { formatBytes } from "@/lib/utils";

/**
 * Tetos de tamanho, em um lugar só.
 *
 * Vive separado de `files.ts` porque o NAVEGADOR também precisa deles: o
 * servidor só descobre que o arquivo é grande demais depois de recebê-lo
 * inteiro, e quando o envio é de centenas de MB isso são minutos de espera
 * para terminar num erro. A conferência no cliente é a que o usuário sente; a
 * do servidor continua valendo, porque cliente não é lugar de guardar regra.
 *
 * Nada de `node:` aqui — este módulo é importado por um Client Component.
 */

export const MAX_BYTES = {
  video: 500 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  pdf: 30 * 1024 * 1024,
  instruction: 30 * 1024 * 1024,
  transcript: 2 * 1024 * 1024,
} as const;

export type UploadRule = keyof typeof MAX_BYTES;

/**
 * Teto do corpo inteiro de uma Server Action.
 *
 * ATENÇÃO: precisa acompanhar `experimental.serverActions.bodySizeLimit` no
 * next.config.mjs. O arquivo de config é ESM puro e não importa TypeScript,
 * então os dois números vivem separados — mexeu em um, mexa no outro.
 *
 * Existe porque o envio de vídeo manda TRÊS arquivos no mesmo FormData (vídeo,
 * instrução escrita e transcrição). O limite do Next vale para a soma, não
 * para o maior deles.
 */
export const MAX_REQUEST_BYTES = 520 * 1024 * 1024;

export interface UploadItem {
  /** Como o campo aparece na tela, para a mensagem citar o certo. */
  label: string;
  bytes: number;
  max: number;
}

/**
 * Confere os arquivos de um envio. Devolve a mensagem pronta para a tela, ou
 * null quando tudo cabe.
 *
 * O arquivo individual é conferido antes da soma de propósito: "o vídeo passa
 * do limite" é acionável, "os arquivos somam demais" só diz que algo está
 * grande. Quando os dois falham, o mais específico é o mais útil.
 */
export function validateUploadSizes(items: UploadItem[]): string | null {
  for (const item of items) {
    if (item.bytes > item.max) {
      return `${item.label} tem ${formatBytes(item.bytes)} — o limite é ${formatBytes(item.max)}.`;
    }
  }

  const total = items.reduce((soma, item) => soma + item.bytes, 0);
  if (total > MAX_REQUEST_BYTES) {
    return `Os arquivos somam ${formatBytes(total)} — o envio aceita no máximo ${formatBytes(MAX_REQUEST_BYTES)} de uma vez.`;
  }

  return null;
}
