/**
 * Compartilhamento de vídeo entre subsetores.
 *
 * Um vídeo compartilhado não é cópia: é a mesma linha de `Video` (e o mesmo
 * arquivo em disco) lida a partir de outro subsetor, via `VideoShare`. O que
 * este módulo decide, sem Prisma nem React, é como a lista do subsetor de
 * destino se compõe.
 */

/** Próprios primeiro, compartilhados depois; um id aparece uma vez só. */
export function mergeSharedVideos<T extends { id: string }>(
  own: readonly T[],
  shared: readonly T[],
): T[] {
  const seen = new Set(own.map((v) => v.id));
  const extra = shared.filter((v) => !seen.has(v.id) && (seen.add(v.id), true));
  return [...own, ...extra];
}
