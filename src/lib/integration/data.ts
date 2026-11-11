import { prisma } from "@/lib/db/prisma";
import { accessClosed } from "./access";
import { getGuestSession } from "./guest-session";
import { filmStates } from "./trail";
import type { LibraryItem, TrailFilm } from "@/types/integration";

/**
 * Leitura da Página de Integração.
 *
 * Duas conferências, SEMPRE as duas juntas, e é o que sustenta o isolamento:
 *  1. o cookie de convidado é autêntico (assinatura + prazo);
 *  2. o convite continua VÁLIDO no banco.
 *
 * A segunda não é redundante. A assinatura do cookie só prova que o cookie foi
 * emitido por nós — ela não sabe que o convite foi revogado cinco minutos
 * atrás, nem que a janela de 24 h aberta pela conclusão já venceu. Sem a
 * consulta, revogar só teria efeito 12 horas depois, no vencimento do cookie.
 */

export interface GuestContext {
  guestId: string;
  fullName: string;
}

/** Convidado autenticado E com convite ainda de pé. Null se qualquer um falha. */
export async function resolveGuest(): Promise<GuestContext | null> {
  const payload = await getGuestSession();
  if (!payload) return null;

  const guest = await prisma.integrationGuest.findFirst({
    where: { id: payload.guestId },
    select: { id: true, fullName: true, revokedAt: true, accessUntil: true },
  });
  // O prazo é conferido aqui, e não no `where`, para a regra viver em
  // `access.ts` junto das outras duas que leem os mesmos campos.
  if (!guest || accessClosed(guest, new Date())) return null;

  return { guestId: guest.id, fullName: guest.fullName };
}

/**
 * O convite deste token, se existir e não estiver revogado.
 *
 * Devolve o nome para a tela de confirmação ("Você é Maria Silva?"). O
 * telefone NÃO sai daqui: ele serve ao envio no servidor e não tem por que
 * trafegar para uma página pública.
 */
export async function resolveInvite(
  token: string,
): Promise<{ id: string; fullName: string; confirmed: boolean } | null> {
  if (!token) return null;
  const guest = await prisma.integrationGuest.findFirst({
    where: { token },
    select: {
      id: true,
      fullName: true,
      confirmedAt: true,
      revokedAt: true,
      accessUntil: true,
    },
  });
  if (!guest || accessClosed(guest, new Date())) return null;
  return { id: guest.id, fullName: guest.fullName, confirmed: guest.confirmedAt !== null };
}

/**
 * Filmes na ordem da trilha, com o estado de cada um para ESTE convidado e as
 * perguntas prontas para o bloco do vídeo.
 *
 * As perguntas saem SEM o gabarito. Elas são renderizadas junto do vídeo, no
 * mesmo bloco, então estão no HTML que chega ao navegador — mandar qual é a
 * correta junto entregaria a prova com o enunciado. A correção acontece só no
 * servidor (`lib/integration/grade`).
 */
export async function getTrail(guestId: string | null): Promise<TrailFilm[]> {
  const [films, approved] = await Promise.all([
    prisma.integrationAsset.findMany({
      where: { kind: "FILME" },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        focus: true,
        lesson: true,
        filePath: true,
        order: true,
        questions: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            label: true,
            // `correct` fica de fora de propósito. Ver o comentário acima.
            options: { orderBy: { order: "asc" }, select: { id: true, label: true } },
          },
        },
      },
    }),
    guestId
      ? prisma.integrationAttempt.findMany({
          where: { guestId, passed: true },
          select: { assetId: true },
        })
      : Promise.resolve([]),
  ]);

  const concludedIds = new Set(approved.map((a) => a.assetId));
  const states = filmStates(films, concludedIds);

  return films.map((film, i) => ({
    id: film.id,
    title: film.title,
    focus: film.focus ?? undefined,
    lesson: film.lesson ?? undefined,
    filePath: film.filePath,
    order: film.order,
    questions: film.questions,
    // `filmStates` devolve um estado por filme, então o índice sempre existe;
    // o TS não sabe disso. O padrão é TRANCADO, e não LIBERADO, porque se um
    // dia essa garantia quebrar o erro tem de travar a trilha, nunca abri-la.
    state: states[i] ?? "TRANCADO",
  }));
}

/** A última tentativa de cada filme, para a tela dizer por que ele voltou. */
export async function lastAttempts(
  guestId: string,
): Promise<Map<string, { correctCount: number; totalCount: number; passed: boolean }>> {
  const rows = await prisma.integrationAttempt.findMany({
    where: { guestId },
    orderBy: { createdAt: "desc" },
    select: { assetId: true, correctCount: true, totalCount: true, passed: true },
  });

  const porFilme = new Map<string, { correctCount: number; totalCount: number; passed: boolean }>();
  // `orderBy desc` + "só grava a primeira" = a mais recente de cada filme.
  for (const row of rows) if (!porFilme.has(row.assetId)) porFilme.set(row.assetId, row);
  return porFilme;
}

/** Acervo complementar: vídeos e documentos fora da trilha. */
export async function getLibrary(): Promise<LibraryItem[]> {
  const rows = await prisma.integrationAsset.findMany({
    where: { kind: { in: ["VIDEO", "DOCUMENTO"] }, filePath: { not: null } },
    orderBy: [{ kind: "asc" }, { order: "asc" }],
    select: { id: true, kind: true, title: true, filePath: true },
  });

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as "VIDEO" | "DOCUMENTO",
    title: r.title,
    filePath: r.filePath as string,
  }));
}
