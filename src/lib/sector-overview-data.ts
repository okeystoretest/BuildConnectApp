import { prisma } from "@/lib/db/prisma";
import { dateLabelBR } from "@/lib/brasilia";
import { ROLE_LABEL } from "@/lib/permissions";
import { TRACKED_SUBSECTOR } from "@/lib/progress-scope";
import { isPassing } from "@/lib/video-comprehension";
import { averageOf } from "@/lib/video-rating";
import {
  approvedAverage,
  belongsToSubsector,
  progressPct,
  splitGrades,
  type MemberEvaluation,
  type MemberOverview,
} from "@/lib/sector-overview";
import type { Role } from "@/types";

/** Um vídeo do setor com as médias de qualidade que os colaboradores deram. */
export interface VideoQualityRow {
  videoId: string;
  title: string;
  subsector: string;
  /** Miniatura (.webp) capturada no envio. Sem ela, o card usa o placeholder. */
  thumbnailPath?: string;
  ratings: number;
  audio: number | null;
  image: number | null;
  clarity: number | null;
  /** Média dos três critérios. Nula quando ninguém avaliou. */
  average: number | null;
}

/** Uma pílula do seletor: o setor inteiro, ou um subsetor dele. */
export interface OverviewScope {
  sectorId: string;
  sectorLabel: string;
  /** Ausente na pílula do setor inteiro. */
  subsectorId?: string;
  subsectorLabel?: string;
}

/** O que se está olhando: o setor todo, ou um subsetor. */
export interface OverviewTarget {
  sectorId: string;
  subsectorId?: string;
}

export interface SectorOverview {
  sectorId: string;
  sectorLabel: string;
  /** Rótulo do subsetor quando o recorte é de um só. */
  subsectorId?: string;
  subsectorLabel?: string;
  memberCount: number;
  totalItems: number;
  doneItems: number;
  progress: number;
  /** Média do setor: TODAS as notas aprovadas, um denominador só. */
  average: number | null;
  rejections: number;
  members: MemberOverview[];
  videos: VideoQualityRow[];
}

/**
 * As pílulas do seletor do Admin: cada setor, seguido dos seus subsetores.
 *
 * Só subsetores PADRAO. Vitrine não tem material a concluir, então uma pílula
 * dela mostraria uma equipe com progresso 0 de 0 — um painel que não responde
 * nada.
 */
export async function listScopesForOverview(): Promise<OverviewScope[]> {
  const sectors = await prisma.sector.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true,
      label: true,
      subsectors: {
        where: TRACKED_SUBSECTOR,
        orderBy: { order: "asc" },
        select: { id: true, label: true },
      },
    },
  });

  const scopes: OverviewScope[] = [];
  for (const sector of sectors) {
    scopes.push({ sectorId: sector.id, sectorLabel: sector.label });
    for (const sub of sector.subsectors) {
      scopes.push({
        sectorId: sector.id,
        sectorLabel: sector.label,
        subsectorId: sub.id,
        subsectorLabel: sub.label,
      });
    }
  }
  return scopes;
}

/**
 * O painel de um setor. A régua do progresso é a mesma de "Meu Progresso"
 * (`TRACKED_SUBSECTOR`): se o painel do gestor discordar do que o colaborador
 * vê, os dois percebem.
 */
export async function getSectorOverview(target: OverviewTarget): Promise<SectorOverview> {
  const { sectorId, subsectorId } = target;

  /*
   * O recorte do CONTEÚDO. Escolher um subsetor faz do painel o painel
   * daquele treinamento: o denominador passa a ser o material dele, e não o
   * do setor inteiro — senão o progresso diria "3 de 40" para quem concluiu
   * os 3 itens do subsetor escolhido.
   */
  const subsectorScope = { sectorId, ...TRACKED_SUBSECTOR, ...(subsectorId ? { id: subsectorId } : {}) };

  const [sector, roster, subsectors] = await Promise.all([
    prisma.sector.findUnique({ where: { id: sectorId }, select: { label: true } }),
    prisma.user.findMany({
      where: { sectorId, active: true },
      orderBy: { fullName: "asc" },
      // `createdAt` é data de CADASTRO. O modelo não guarda admissão, e o card
      // rotula o campo como cadastro para não sugerir o que não sabe.
      select: {
        id: true,
        fullName: true,
        role: true,
        avatarPath: true,
        createdAt: true,
        subsectors: { select: { subsectorId: true } },
      },
    }),
    prisma.subsector.findMany({
      where: subsectorScope,
      select: {
        id: true,
        label: true,
        videos: { select: { id: true, title: true, thumbnailPath: true } },
        documents: { select: { id: true } },
      },
    }),
  ]);

  /*
   * O recorte das PESSOAS, pela mesma regra de acesso do sistema
   * (`belongsToSubsector`): quem marcou o subsetor, mais quem não marcou
   * nenhum. A consulta não filtra isto no banco porque a regra "vazio = todos"
   * não se escreve num `where` sem duplicá-la — e duplicada ela sai do lugar
   * com o tempo.
   */
  const members = subsectorId
    ? roster.filter((u) =>
        belongsToSubsector({ subsectorIds: u.subsectors.map((s) => s.subsectorId) }, subsectorId),
      )
    : roster;

  const memberIds = members.map((m) => m.id);
  const videoIds = subsectors.flatMap((s) => s.videos.map((v) => v.id));
  const totalItems = videoIds.length + subsectors.reduce((n, s) => n + s.documents.length, 0);

  const [done, graded, ratings] = await Promise.all([
    prisma.contentProgress.findMany({
      where: {
        userId: { in: memberIds },
        completed: true,
        OR: [
          { video: { subsector: subsectorScope } },
          { document: { subsector: subsectorScope } },
        ],
      },
      select: { userId: true },
    }),
    // As notas vêm inteiras, e não só o número: o card lista as avaliações já
    // dadas àquela pessoa, e uma segunda consulta por colaborador aberto seria
    // uma ida ao banco por clique.
    prisma.videoComprehension.findMany({
      where: { userId: { in: memberIds }, gradedAt: { not: null } },
      orderBy: { gradedAt: "desc" },
      select: {
        id: true,
        userId: true,
        grade: true,
        attempt: true,
        gradedAt: true,
        video: { select: { title: true } },
      },
    }),
    // Os comentários saíram do card, então saem também da consulta: dado
    // carregado e nunca exibido é peso que ninguém cobra de volta.
    prisma.videoRating.findMany({
      where: { videoId: { in: videoIds } },
      select: { videoId: true, audio: true, image: true, clarity: true },
    }),
  ]);

  const doneByUser = new Map<string, number>();
  for (const d of done) doneByUser.set(d.userId, (doneByUser.get(d.userId) ?? 0) + 1);

  const gradesByUser = new Map<string, { grade: number }[]>();
  const evaluationsByUser = new Map<string, MemberEvaluation[]>();
  const allGrades: { grade: number }[] = [];
  for (const g of graded) {
    // `grade` e `gradedAt` não são nulos aqui (o filtro acima garante); o
    // TypeScript não tem como saber disso.
    if (g.grade == null || g.gradedAt == null) continue;
    const list = gradesByUser.get(g.userId) ?? [];
    list.push({ grade: g.grade });
    gradesByUser.set(g.userId, list);
    allGrades.push({ grade: g.grade });

    const entries = evaluationsByUser.get(g.userId) ?? [];
    entries.push({
      id: g.id,
      videoTitle: g.video.title,
      grade: g.grade,
      attempt: g.attempt,
      gradedAtLabel: dateLabelBR(g.gradedAt),
      passed: isPassing(g.grade),
    });
    evaluationsByUser.set(g.userId, entries);
  }

  const memberRows: MemberOverview[] = members.map((m) => {
    const { approved, rejections } = splitGrades(gradesByUser.get(m.id) ?? []);
    const doneItems = doneByUser.get(m.id) ?? 0;
    return {
      userId: m.id,
      name: m.fullName,
      role: ROLE_LABEL[m.role as Role],
      avatarPath: m.avatarPath ?? undefined,
      sinceLabel: dateLabelBR(m.createdAt),
      doneItems,
      totalItems,
      progress: progressPct(doneItems, totalItems),
      average: approvedAverage(approved),
      rejections,
      pending: Math.max(totalItems - doneItems, 0),
      evaluations: evaluationsByUser.get(m.id) ?? [],
    };
  });

  // Média do setor: um denominador só. A média das médias daria o mesmo peso a
  // quem tem uma nota e a quem tem trinta.
  const sectorSplit = splitGrades(allGrades);

  const byVideo = new Map<string, VideoQualityRow>();
  for (const sub of subsectors) {
    for (const v of sub.videos) {
      byVideo.set(v.id, {
        videoId: v.id,
        title: v.title,
        subsector: sub.label,
        thumbnailPath: v.thumbnailPath ?? undefined,
        ratings: 0,
        audio: null,
        image: null,
        clarity: null,
        average: null,
      });
    }
  }

  const raw = new Map<
    string,
    { audio: (number | null)[]; image: (number | null)[]; clarity: (number | null)[] }
  >();
  for (const r of ratings) {
    const bucket = raw.get(r.videoId) ?? { audio: [], image: [], clarity: [] };
    bucket.audio.push(r.audio);
    bucket.image.push(r.image);
    bucket.clarity.push(r.clarity);
    raw.set(r.videoId, bucket);

    const row = byVideo.get(r.videoId);
    if (!row) continue;
    row.ratings += 1;
  }
  for (const [id, bucket] of raw) {
    const row = byVideo.get(id);
    if (!row) continue;
    row.audio = averageOf(bucket.audio);
    row.image = averageOf(bucket.image);
    row.clarity = averageOf(bucket.clarity);
    // Média dos TRÊS critérios, não das notas soltas: cada critério já é uma
    // média, e dar peso maior ao que mais gente respondeu diria que clareza
    // vale menos quando menos gente opinou sobre ela.
    row.average = averageOf([row.audio, row.image, row.clarity]);
  }

  // Pior primeiro: a pergunta real é "qual vídeo precisa ser refeito?". Vídeo
  // sem avaliação não é ruim, é desconhecido — vai para o fim.
  const videos = [...byVideo.values()].sort((a, b) => {
    if (a.average === null && b.average === null) {
      return a.title.localeCompare(b.title, "pt-BR");
    }
    if (a.average === null) return 1;
    if (b.average === null) return -1;
    return a.average - b.average;
  });

  const doneItems = done.length;
  return {
    sectorId,
    sectorLabel: sector?.label ?? "—",
    subsectorId,
    // O rótulo sai da lista já carregada: com `id` no filtro, ela tem um item.
    subsectorLabel: subsectorId ? subsectors[0]?.label : undefined,
    memberCount: members.length,
    totalItems,
    doneItems,
    // Denominador do setor: cada colaborador precisa concluir todos os itens.
    progress: progressPct(doneItems, totalItems * Math.max(members.length, 1)),
    average: approvedAverage(sectorSplit.approved),
    rejections: sectorSplit.rejections,
    members: memberRows,
    videos,
  };
}
