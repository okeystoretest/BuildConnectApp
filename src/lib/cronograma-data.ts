import { prisma } from "@/lib/db/prisma";
import { resolveAppScope } from "@/lib/app-scope";
import { FUNNEL_ORDER, MONTH_LABEL, WEEKDAY_SHORT } from "@/lib/funnel";
import { visibilityForSlug } from "@/lib/cronograma-visibility";
import type { Role } from "@/types";
import type {
  ContentPlatform,
  ContentPostItem,
  ContentVisibility,
  CronogramaData,
  FunnelBalanceSlice,
  FunnelStage,
  FunnelVolumePoint,
  PostOwner,
} from "@/types/cronograma";

/**
 * Leitura do Cronograma.
 *
 * Fuso: a data agendada é gravada e lida em UTC a partir do que foi digitado
 * (yyyy-mm-dd + hh:mm). Assim a célula do calendário é sempre exatamente o dia
 * escolhido, independente do fuso do servidor da VPS.
 *
 * Alcance: o filtro de visibilidade é aplicado na CONSULTA, não na UI. O que
 * não pode ser visto nem chega ao cliente.
 */

const CELL_MS = 24 * 60 * 60 * 1000;

/** Converte data e hora digitadas em um Date UTC estável. */
export function toScheduledDate(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const safeTime = /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  const parsed = new Date(`${date}T${safeTime}:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isoTime(value: Date): string {
  return value.toISOString().slice(11, 16);
}

/** Índice 0–6 começando na segunda-feira. */
function weekdayFromUtc(value: Date): number {
  return (value.getUTCDay() + 6) % 7;
}

/**
 * Primeira célula da grade: a segunda-feira da semana em que o mês começa.
 * `month` é 1–12 e `year` o ano cheio.
 */
export function gridStart(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return new Date(first.getTime() - weekdayFromUtc(first) * CELL_MS);
}

/** Última célula da grade: o domingo da semana em que o mês termina. */
export function gridEnd(year: number, month: number): Date {
  const last = new Date(Date.UTC(year, month, 0));
  return new Date(last.getTime() + (6 - weekdayFromUtc(last)) * CELL_MS);
}

interface PostRow {
  id: string;
  title: string;
  scheduledAt: Date;
  funnel: FunnelStage;
  format: ContentPostItem["format"];
  status: ContentPostItem["status"];
  brand: ContentPostItem["brand"] | null;
  platforms: ContentPlatform[];
  formatOther: string | null;
  notes: string | null;
  visibility: ContentVisibility;
  originSlug: string | null;
  createdById: string | null;
  createdBy: { fullName: string } | null;
  owner: { id: string; fullName: string; avatarPath: string | null } | null;
}

/**
 * Regra de edição do Cronograma: criar é livre para qualquer usuário, mas
 * editar é privilégio do AUTOR do registro. Admin mantém override para poder
 * corrigir e organizar a agenda do time.
 *
 * Vale igualmente para post do Marketing (SHARED): quem não é autor apenas lê.
 */
export function canEditPost(
  createdById: string | null,
  userId: string,
  role: Role,
): boolean {
  if (role === "ADMIN") return true;
  return createdById !== null && createdById === userId;
}

/**
 * Excluir segue a mesma regra de editar: dono do card ou Admin.
 * (Antes era exclusivo de Admin.)
 */
export function canDeletePost(
  createdById: string | null,
  userId: string,
  role: Role,
): boolean {
  return canEditPost(createdById, userId, role);
}

/** Quem pode enxergar o post — espelho do filtro aplicado na consulta. */
export function canViewPost(
  visibility: ContentVisibility,
  createdById: string | null,
  userId: string,
  role: Role,
): boolean {
  if (visibility === "SHARED") return true;
  if (role === "ADMIN") return true;
  return createdById !== null && createdById === userId;
}

function toItem(row: PostRow, userId: string, role: Role): ContentPostItem {
  return {
    id: row.id,
    title: row.title,
    date: isoDate(row.scheduledAt),
    time: isoTime(row.scheduledAt),
    funnel: row.funnel,
    format: row.format,
    status: row.status,
    brand: row.brand ?? undefined,
    platforms: row.platforms ?? [],
    formatOther: row.formatOther ?? undefined,
    owner: row.owner
      ? {
          id: row.owner.id,
          name: row.owner.fullName,
          avatarPath: row.owner.avatarPath ?? undefined,
        }
      : null,
    notes: row.notes ?? undefined,
    authorId: row.createdById ?? undefined,
    authorName: row.createdBy?.fullName ?? undefined,
    visibility: row.visibility,
    originSlug: row.originSlug ?? undefined,
    canEdit: canEditPost(row.createdById, userId, role),
    canDelete: canDeletePost(row.createdById, userId, role),
  };
}

export async function getCronogramaData(
  slug: string,
  year: number,
  month: number,
  userId: string,
  role: Role,
): Promise<CronogramaData | null> {
  const scope = await resolveAppScope(slug);
  if (!scope || !scope.scheduleEnabled) return null;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const rangeStart = gridStart(year, month);
  // A grade termina no domingo; soma-se um dia para virar limite exclusivo.
  const rangeEnd = new Date(gridEnd(year, month).getTime() + CELL_MS);

  /**
   * Alcance na consulta: post do Marketing é de todos; post privado só
   * aparece para o próprio autor. Admin lê tudo.
   */
  const visibilityWhere =
    role === "ADMIN"
      ? {}
      : { OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };

  const [rows, people] = await Promise.all([
    prisma.contentPost.findMany({
      where: {
        subsectorId: scope.id,
        scheduledAt: { gte: rangeStart, lt: rangeEnd },
        ...visibilityWhere,
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        funnel: true,
        format: true,
        status: true,
        brand: true,
        platforms: true,
        formatOther: true,
        notes: true,
        visibility: true,
        originSlug: true,
        createdById: true,
        createdBy: { select: { fullName: true } },
        owner: { select: { id: true, fullName: true, avatarPath: true } },
      },
    }),
    // Responsáveis: membros do subsetor de escopo; sem membros, todos ativos.
    prisma.user.findMany({
      where: {
        active: true,
        OR: [
          { subsectors: { some: { subsectorId: scope.id } } },
          { role: { in: ["GESTOR", "ADMIN"] } },
        ],
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, avatarPath: true },
    }),
  ]);

  const posts = (rows as PostRow[]).map((row) => toItem(row, userId, role));

  // Métricas consideram apenas o mês corrente — a grade extrapola para as
  // semanas vizinhas, mas os números do topo são do mês exibido.
  const inMonth = (rows as PostRow[]).filter(
    (row) => row.scheduledAt >= monthStart && row.scheduledAt < monthEnd,
  );

  const volume: FunnelVolumePoint[] = WEEKDAY_SHORT.map((label) => ({
    label,
    TOFU: 0,
    MOFU: 0,
    BOFU: 0,
  }));
  const counters: Record<FunnelStage, number> = { TOFU: 0, MOFU: 0, BOFU: 0 };

  for (const row of inMonth) {
    const point = volume[weekdayFromUtc(row.scheduledAt)];
    if (point) point[row.funnel] += 1;
    counters[row.funnel] += 1;
  }

  const total = inMonth.length;
  const balance: FunnelBalanceSlice[] = FUNNEL_ORDER.map((stage) => ({
    stage,
    count: counters[stage],
    percent: total === 0 ? 0 : Math.round((counters[stage] / total) * 100),
  }));

  const backlog = inMonth
    .filter((row) => row.status !== "PUBLICADO")
    .map((row) => toItem(row, userId, role));

  return {
    scopeSlug: scope.slug,
    scopeLabel: scope.label,
    inherited: scope.inherited,
    // A aba de origem define o alcance do que for criado agora.
    authoring: visibilityForSlug(slug),
    month,
    year,
    monthLabel: `${MONTH_LABEL[month - 1] ?? ""} ${year}`,
    activePosts: backlog.length,
    volume,
    balance,
    posts,
    backlog,
    people: people.map(
      (person: { id: string; fullName: string; avatarPath: string | null }): PostOwner => ({
        id: person.id,
        name: person.fullName,
        avatarPath: person.avatarPath ?? undefined,
      }),
    ),
  };
}
