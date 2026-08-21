import path from "node:path";

/**
 * Configuração de armazenamento em disco local da VPS.
 *
 * Convenção do projeto:
 *  - O binário NUNCA vai para o banco. Só o caminho público (ex.:
 *    /uploads/comprovantes/2026/06/arquivo.webp) é persistido.
 *  - Os arquivos físicos ficam sob UPLOADS_DIR, particionados por ano/mês.
 *
 * Em produção (VPS), defina UPLOADS_DIR=/var/www/app/uploads no .env.
 * Em desenvolvimento, cai em ./uploads na raiz do projeto.
 */

/** Raiz física dos uploads no servidor. */
export const UPLOADS_ROOT =
  process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "uploads");

/** Prefixo público servido pelo Nginx/Next (mapeado para UPLOADS_ROOT). */
export const PUBLIC_PREFIX = "/uploads";

/**
 * Categorias de upload. Cada uma vira uma subpasta dedicada — mantém o
 * disco organizado e facilita rotinas de limpeza/backup por tipo.
 */
export const UPLOAD_CATEGORIES = {
  comprovantes: "comprovantes",
  chamados: "chamados",
  avatares: "avatares",
  conteudo: "conteudo",
} as const;

export type UploadCategory = keyof typeof UPLOAD_CATEGORIES;

/** Segmento ano/mês do momento atual (ex.: "2026/06"). */
export function yearMonthSegment(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}/${month}`;
}

/**
 * Resolve o diretório físico de destino para uma categoria, já com a
 * partição ano/mês. Não cria a pasta — quem grava é responsável por isso.
 */
export function resolveUploadDir(category: UploadCategory, date = new Date()): string {
  return path.join(UPLOADS_ROOT, UPLOAD_CATEGORIES[category], yearMonthSegment(date));
}

/**
 * Converte um caminho físico absoluto (dentro de UPLOADS_ROOT) no caminho
 * público correspondente, sempre com barras normais.
 */
export function toPublicPath(absolutePath: string): string {
  const relative = path.relative(UPLOADS_ROOT, absolutePath).split(path.sep).join("/");
  return `${PUBLIC_PREFIX}/${relative}`;
}

/**
 * Inverso de `toPublicPath`: devolve o caminho físico de um arquivo a partir
 * do caminho público salvo no banco. Usado nas exclusões, para remover o
 * arquivo do disco. Fora do prefixo público, retorna null.
 */
export function toAbsolutePath(publicPath: string): string | null {
  if (!publicPath.startsWith(`${PUBLIC_PREFIX}/`)) return null;
  const relative = publicPath.slice(PUBLIC_PREFIX.length + 1);
  // Barra de segurança contra travessia de diretório vinda de dado sujo.
  if (relative.includes("..")) return null;
  return path.join(UPLOADS_ROOT, ...relative.split("/"));
}
