import { prisma } from "@/lib/db/prisma";
import { dateLabelBR } from "@/lib/brasilia";
import { ROLE_LABEL } from "@/lib/permissions";
import { TRACKED_SUBSECTOR } from "@/lib/progress-scope";
import { isPassing } from "@/lib/video-comprehension";
import { averageOf } from "@/lib/video-rating";
import {
  approvedAverage,
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
  ratings: number;
  audio: number | null;
  image: number | null;
  clarity: number | null;
  comments: { author: string; text: string }[];
}

export interface SectorOverview {
  sectorId: string;
  sectorLabel: string;
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

/** Setores existentes, para o seletor do Admin. */
export async function listSectorsForOverview(): Promise<{ id: string; label: string }[]> {
  return prisma.sector.findMany({
    orderBy: { order: "asc" },
    select: { id: true, label: true },
  });
}

/**
 * O painel de um setor. A régua do progresso é a mesma de "Meu Progresso"
 * (`TRACKED_SUBSECTOR`): se o painel do gestor discordar do que o colaborador
 * vê, os dois percebem.
 */
export async function getSectorOverview(sectorId: string): Promise<SectorOverview> {
  const [sector, members, subsectors] = await Promise.all([
    prisma.sector.findUnique({ where: { id: sectorId }, select: { label: true } }),
    prisma.user.findMany({
      where: { sectorId, active: true },
      orderBy: { fullName: "asc" },
      // `createdAt` é data de CADASTRO. O modelo não guarda admissão, e o card
      // rotula o campo como cadastro para não sugerir o que não sabe.
      select: { id: true, fullName: true, role: true, avatarPath: true, createdAt: true },
    }),
    prisma.subsector.findMany({
      where: { sectorId, ...TRACKED_SUBSECTOR },
      select: {
        label: true,
        videos: { select: { id: true, title: true } },
        documents: { select: { id: true } },
      },
    }),
  ]);

  const memberIds = members.map((m) => m.id);
  const videoIds = subsectors.flatMap((s) => s.videos.map((v) => v.id));
  const totalItems = videoIds.length + subsectors.reduce((n, s) => n + s.documents.length, 0);

  const [done, graded, ratings] = await Promise.all([
    prisma.contentProgress.findMany({
      where: {
        userId: { in: memberIds },
        completed: true,
        OR: [
          { video: { subsector: { sectorId, ...TRACKED_SUBSECTOR } } },
          { document: { subsector: { sectorId, ...TRACKED_SUBSECTOR } } },
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
    prisma.videoRating.findMany({
      where: { videoId: { in: videoIds } },
      select: {
        videoId: true,
        audio: true,
        image: true,
        clarity: true,
        comment: true,
        user: { select: { fullName: true } },
      },
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
        ratings: 0,
        audio: null,
        image: null,
        clarity: null,
        comments: [],
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
    if (r.comment) row.comments.push({ author: r.user.fullName, text: r.comment });
  }
  for (const [id, bucket] of raw) {
    const row = byVideo.get(id);
    if (!row) continue;
    row.audio = averageOf(bucket.audio);
    row.image = averageOf(bucket.image);
    row.clarity = averageOf(bucket.clarity);
  }

  // Pior primeiro: a pergunta real é "qual vídeo precisa ser refeito?". Vídeo
  // sem avaliação não é ruim, é desconhecido — vai para o fim.
  const videos = [...byVideo.values()].sort((a, b) => {
    const ma = averageOf([a.audio, a.image, a.clarity]);
    const mb = averageOf([b.audio, b.image, b.clarity]);
    if (ma === null && mb === null) return a.title.localeCompare(b.title, "pt-BR");
    if (ma === null) return 1;
    if (mb === null) return -1;
    return ma - mb;
  });

  const doneItems = done.length;
  return {
    sectorId,
    sectorLabel: sector?.label ?? "—",
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
