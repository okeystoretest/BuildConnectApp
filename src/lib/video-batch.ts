import { MAX_BYTES } from "./storage/limits";
import { formatBytes } from "./utils";

/**
 * Regras do envio de vídeos em lote.
 *
 * Puro, sem React nem `node:` — é importado pelo modal (Client Component) e
 * pelos testes. A parte de rede (XHR com progresso) fica no modal, que passa
 * para `runSequentially` a função de envio de UM item.
 */

/** Vídeos por lote. Acima disso o modal recusa a seleção inteira. */
export const MAX_BATCH_FILES = 15;

/**
 * Título sugerido a partir do nome do arquivo: sem extensão, sem `_`/`-`.
 *
 * É o que torna o título OPCIONAL no envio — a linha já chega preenchida com
 * o nome do próprio arquivo, e trocar passa a ser escolha de quem envia.
 */
export function titleFromFilename(name: string, fallback = "Vídeo"): string {
  const semExtensao = name.replace(/\.[^.]+$/, "");
  const limpo = semExtensao.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return limpo || fallback;
}

export interface BatchFile {
  name: string;
  size: number;
}

/** Como o tipo de arquivo se chama nas mensagens: singular e plural. */
export interface BatchLabels {
  maxBytes: number;
  singular: string;
  plural: string;
}

const VIDEO_LABELS: BatchLabels = {
  maxBytes: MAX_BYTES.video,
  singular: "vídeo",
  plural: "vídeos",
};

/**
 * Confere a seleção ANTES de subir um byte: quantidade e teto por arquivo.
 * Cada arquivo vai na sua própria requisição, então não há soma a conferir —
 * o teto que importa é o individual.
 *
 * Os rótulos entram por parâmetro porque as fotos usam a mesma fila: o teto
 * de 15 por operação e a recusa do lote inteiro são a MESMA regra, e duplicá-la
 * seria assinar que um dia os dois números divergem sem ninguém notar.
 */
export function validateBatch(
  files: readonly BatchFile[],
  labels: BatchLabels = VIDEO_LABELS,
): string | null {
  if (files.length === 0) return `Selecione ao menos um ${labels.singular}.`;
  if (files.length > MAX_BATCH_FILES) {
    return `Selecione no máximo ${MAX_BATCH_FILES} ${labels.plural} por vez (você escolheu ${files.length}).`;
  }
  for (const file of files) {
    if (file.size > labels.maxBytes) {
      return `${file.name} tem ${formatBytes(file.size)} — o limite por ${labels.singular} é ${formatBytes(labels.maxBytes)}.`;
    }
  }
  return null;
}

export interface QueueResult {
  ok: boolean;
  error?: string;
}

/**
 * Envia os itens UM POR VEZ, na ordem. A falha (ou exceção) de um item vira
 * resultado de erro e a fila segue para o próximo — quem chama decide o que
 * mostrar por item.
 */
export async function runSequentially<T>(
  items: readonly T[],
  send: (item: T, index: number) => Promise<QueueResult>,
): Promise<QueueResult[]> {
  const results: QueueResult[] = [];
  for (let i = 0; i < items.length; i++) {
    try {
      results.push(await send(items[i] as T, i));
    } catch (e) {
      results.push({ ok: false, error: e instanceof Error ? e.message : "Falha no envio." });
    }
  }
  return results;
}
