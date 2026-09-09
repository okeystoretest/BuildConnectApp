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
   * 110 MB — e o que limita este número é TEMPO, não memória.
   *
   * A restrição de verdade não está em byte nenhum: está no `requestTimeout` do
   * Node, que vale **300 segundos** e que o `next start` não deixa configurar
   * (ele só mexe em `keepAliveTimeout`). Passou disso, o Node destrói o socket,
   * o proxy responde 502 e o log fica com um `ECONNRESET` mudo. O teto real de
   * upload é, portanto, **banda de subida × 300 s** — e muda de usuário para
   * usuário.
   *
   * Medido em produção em 09/09/2026: 71,6 MB subiram em ~120 s, ou ~4,8 Mbps.
   * A medição vale porque `welcomeVideo.manage` é permissão só de Admin: quem
   * envia vídeo é sempre a mesma pessoa, e é a banda dela que decide.
   *
   * A 4,8 Mbps, 110 MB levam ~184 s — 61% do limite, com folga para a variação
   * normal da rede. Os 150 MB anteriores levariam ~251 s, e o pior envio que a
   * interface permitia (150 + 50 + 5) levava ~344 s: passava em toda a
   * conferência de tamanho e morria por tempo, que é exatamente o defeito que
   * estes tetos existem para evitar.
   *
   * Memória continua confortável e deixou de ser o critério: ~290 MB de pico
   * contra os ~11 GB livres do host, sem limite por contêiner.
   *
   * Para subir este número, o caminho NÃO é editar aqui: é levantar o
   * `requestTimeout` com servidor próprio, ou fatiar o envio em pedaços.
   */
  video: 110 * 1024 * 1024,
  image: 50 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  pdf: 50 * 1024 * 1024,
  /**
   * 25 MB, metade dos demais documentos — e a razão não é o arquivo, é a
   * companhia.
   *
   * A instrução escrita é o único documento que viaja no MESMO FormData de um
   * vídeo. O que precisa caber em 300 s é a SOMA, então cada MB aqui é um MB a
   * menos disponível para o vídeo. 25 MB é generoso para um PDF ou DOCX de
   * instrução, e devolve 25 MB de orçamento para o que de fato é grande.
   */
  instruction: 25 * 1024 * 1024,
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
 * 110 + 25 + 5 = 140 MB, e os 5 MB restantes são folga para o overhead do
 * multipart — o cliente soma bytes de ARQUIVO, mas o corpo HTTP carrega
 * fronteiras e cabeçalhos por cima. Sem essa folga, um envio aprovado no
 * navegador seria recusado no servidor por alguns KB.
 *
 * O QUE DECIDE ESTE NÚMERO É TEMPO. A 4,8 Mbps medidos em produção, 145 MB
 * levam ~243 s, contra os 300 s do `requestTimeout` do Node — 81% do limite.
 * Memória deixou de ser o critério: mesmo dobrada pela bufferização (middleware
 * + FormData), a conta dá ~290 MB contra ~11 GB livres no host.
 *
 * Antes de subir isto, refaça a conta de tempo: um envio que não termina em
 * 300 s morre em 502 com um `ECONNRESET` mudo no log, e nenhuma conferência de
 * tamanho — nem aqui, nem no navegador — vai avisar o usuário.
 */
export const MAX_REQUEST_BYTES = 145 * 1024 * 1024;

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
