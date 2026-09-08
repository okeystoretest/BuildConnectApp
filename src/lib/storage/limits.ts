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
 * Nada de `node:` aqui — este módulo é importado por Client Components.
 */

export const MAX_BYTES = {
  /**
   * 150 MB — o teto de precaução, escolhido contra a memória e não contra os
   * 400 MB do pedido original.
   *
   * O teto está preso à memória, não à vontade. TODO upload ainda passa por
   * Server Action, e o corpo de uma action é bufferizado DUAS vezes antes de o
   * código do projeto ver um byte: uma pelo middleware
   * (experimental.middlewareClientMaxBodySize) e outra para montar o FormData
   * (experimental.serverActions.bodySizeLimit). O que se envia custa o dobro
   * em RSS, e contêiner sem memória é processo morto — que derruba a aplicação
   * para todo mundo, não só para quem enviava.
   *
   * A 400 MB o corpo passava de 1 GB, e não valia arriscar. A 150 MB o pior
   * envio custa ~430 MB de pico contra os ~11 GB livres medidos no host em
   * 08/09/2026 — folga de mais de vinte vezes, sem limite por contêiner.
   *
   * Acima disso, o caminho não é subir o número: é tirar o vídeo da Server
   * Action para uma rota que escreve em fluxo, fora do matcher do middleware.
   * Aí a memória deixa de acompanhar o tamanho do arquivo.
   */
  video: 150 * 1024 * 1024,
  image: 50 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  pdf: 50 * 1024 * 1024,
  instruction: 50 * 1024 * 1024,
  /**
   * Transcrição é a exceção deliberada aos 50 MB dos demais documentos.
   *
   * O conteúdo dela não fica só no disco: `extractTranscriptText` lê o arquivo
   * inteiro para uma string e ela é gravada na coluna `transcriptText`. Um
   * arquivo de 50 MB viraria uma linha de 50 MB no Postgres, carregada toda
   * vez que a tela do vídeo abrir. Cinco MB já são cerca de 2,5 milhões de
   * caracteres — muito além de qualquer transcrição real.
   */
  transcript: 5 * 1024 * 1024,
} as const;

export type UploadRule = keyof typeof MAX_BYTES;

/**
 * Teto do corpo inteiro de uma requisição de envio.
 *
 * ATENÇÃO: precisa acompanhar DOIS valores no next.config.mjs —
 * `experimental.serverActions.bodySizeLimit` e
 * `experimental.middlewareClientMaxBodySize`. O arquivo de config é ESM puro e
 * não importa TypeScript, então os números vivem separados: mexeu aqui, mexa
 * lá.
 *
 * O middleware é o portão mais baixo e o menos óbvio: como o Server Action
 * posta na URL da própria página, e o matcher cobre `/setores/*`, o Next
 * bufferiza o corpo para o middleware ANTES de qualquer outra coisa. O padrão
 * dele são 10 MB, e era o que abortava os envios com ECONNRESET muito antes de
 * o bodySizeLimit de 520 MB ter qualquer efeito.
 *
 * O número precisa caber o PIOR envio legítimo, não o maior arquivo: o modal
 * de vídeo manda vídeo, instrução escrita e transcrição no mesmo FormData.
 * 150 + 50 + 5 = 205 MB, e o resto é folga para o overhead do multipart.
 *
 * Custo em memória: o corpo é bufferizado duas vezes (middleware + FormData),
 * então este teto vale o DOBRO em RSS no pico — ~430 MB aqui. Subi-lo sem
 * olhar a memória do contêiner é como pedir para o kernel matar o processo.
 */
export const MAX_REQUEST_BYTES = 215 * 1024 * 1024;

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

/** Teto em MB inteiros, para os rótulos da interface ("até 50 MB"). */
export function maxMb(rule: UploadRule): number {
  return Math.round(MAX_BYTES[rule] / (1024 * 1024));
}
