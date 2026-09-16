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

/** Título sugerido a partir do nome do arquivo: sem extensão, sem `_`/`-`. */
export function titleFromFilename(name: string): string {
  const semExtensao = name.replace(/\.[^.]+$/, "");
  const limpo = semExtensao.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return limpo || "Vídeo";
}

export interface BatchFile {
  name: string;
  size: number;
}

/**
 * Confere a seleção ANTES de subir um byte: quantidade e teto por arquivo.
 * Cada vídeo vai na sua própria requisição, então não há soma a conferir —
 * o teto que importa é o individual.
 */
export function validateBatch(files: readonly BatchFile[]): string | null {
  if (files.length === 0) return "Selecione ao menos um vídeo.";
  if (files.length > MAX_BATCH_FILES) {
    return `Selecione no máximo ${MAX_BATCH_FILES} vídeos por vez (você escolheu ${files.length}).`;
  }
  for (const file of files) {
    if (file.size > MAX_BYTES.video) {
      return `${file.name} tem ${formatBytes(file.size)} — o limite por vídeo é ${formatBytes(MAX_BYTES.video)}.`;
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
