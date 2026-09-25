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
  type MemberPerformanceEvaluation,
  type PendingContentItem,
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

/** Uma pílula do seletor: um setor. */
export interface OverviewScope {
  sectorId: string;
  sectorLabel: string;
}

/** O que se está olhando. */
export interface OverviewTarget {
  sectorId: string;
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

/**
 * As pílulas do seletor do Admin: um setor, uma pílula.
 *
 * O recorte por subsetor existiu até 22/09 e saiu: ele dividia a equipe em
 * listas que o gestor não pedia e mexia no denominador junto, de modo que a
 * mesma pessoa tinha um percentual em cada pílula.
 */
export async function listScopesForOverview(): Promise<OverviewScope[]> {
  const sectors = await prisma.sector.findMany({
    orderBy: { order: "asc" },
    select: { id: true, label: true },
  });
  return sectors.map((sector) => ({ sectorId: sector.id, sectorLabel: sector.label }));
}

/**
 * O painel de um setor. A régua do progresso é a mesma de "Meu Progresso"
 * (`TRACKED_SUBSECTOR`): se o painel do gestor discordar do que o colaborador
 * vê, os dois percebem.
 */
export async function getSectorOverview(target: OverviewTarget): Promise<SectorOverview> {
  const { sectorId } = target;

  /*
   * O recorte do CONTEÚDO: todo o material PADRAO do setor. A vitrine fica
   * fora — não há o que concluir nela, e contá-la no denominador travaria o
   * progresso de todo mundo abaixo de 100%.
   */
  const contentScope = { sectorId, ...TRACKED_SUBSECTOR };

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
      },
    }),
    prisma.subsector.findMany({
      where: contentScope,
      select: {
        id: true,
        label: true,
        videos: { select: { id: true, title: true, thumbnailPath: true } },
        // `name` entrou junto: o modal de pendências lista os itens, e uma
        // lista de ids não diz a ninguém o que falta ler.
        documents: { select: { id: true, name: true } },
      },
    }),
  ]);

  /*
   * Todo mundo lotado no setor. A marcação de subsetor no cadastro decide o
   * ACESSO da pessoa, e não quem aparece aqui: o painel responde "como está a
   * equipe do setor", e uma equipe recortada responderia outra pergunta.
   */
  const members = roster;

  const memberIds = members.map((m) => m.id);
  const videoIds = subsectors.flatMap((s) => s.videos.map((v) => v.id));
  const totalItems = videoIds.length + subsectors.reduce((n, s) => n + s.documents.length, 0);

  const [done, graded, ratings, performance, typeScales] = await Promise.all([
    prisma.contentProgress.findMany({
      where: {
        userId: { in: memberIds },
        completed: true,
        OR: [
          { video: { subsector: contentScope } },
          { document: { subsector: contentScope } },
        ],
      },
      // Antes vinha só `userId`, para contar. Agora vem o item: o card abre a
      // lista do que falta, e para saber o que falta é preciso saber o que foi
      // feito — a subtração sozinha dá um número, não uma lista.
      select: { userId: true, videoId: true, documentId: true },
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
    /*
     * Avaliações de DESEMPENHO já respondidas sobre estes colaboradores. O
     * Gestor alcança isto porque a matriz já lhe dá `evaluations.view`; o
     * recorte é a equipe do setor dele, que é a mesma lista de sempre.
     *
     * `RASCUNHO` fica de fora: uma avaliação ainda sendo preenchida não é
     * histórico, é trabalho em andamento de outra pessoa.
     */
    prisma.evaluation.findMany({
      where: { subjectId: { in: memberIds }, status: "CONCLUIDA" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subjectId: true,
        total: true,
        cycle: true,
        isSelfAssessment: true,
        createdAt: true,
        type: { select: { id: true, title: true, scaleMax: true } },
        evaluator: { select: { fullName: true } },
      },
    }),
    /*
     * Teto de pontos de cada formulário: nº de questões × nota máxima da
     * escala. Sem ele, `total` é um número solto — "34" não informa nada sem
     * saber se o máximo era 40 ou 170. São poucos tipos, então vêm todos de
     * uma vez em vez de uma consulta por avaliação encontrada.
     */
    prisma.evaluationType.findMany({
      select: {
        id: true,
        scaleMax: true,
        sections: { select: { _count: { select: { questions: true } } } },
      },
    }),
  ]);

  const doneByUser = new Map<string, number>();
  // O que cada pessoa já concluiu, por id de conteúdo. É a outra metade da
  // lista de pendências: catálogo do setor menos isto.
  const doneIdsByUser = new Map<string, Set<string>>();
  for (const d of done) {
    doneByUser.set(d.userId, (doneByUser.get(d.userId) ?? 0) + 1);
    const ids = doneIdsByUser.get(d.userId) ?? new Set<string>();
    const contentId = d.videoId ?? d.documentId;
    if (contentId) ids.add(contentId);
    doneIdsByUser.set(d.userId, ids);
  }

  /*
   * Catálogo do setor na ordem em que o modal mostra: por subsetor, vídeos
   * antes de documentos. Montado uma vez e filtrado por pessoa — remontá-lo
   * dentro do `map` de colaboradores seria refazer o mesmo trabalho N vezes.
   */
  const catalog: PendingContentItem[] = [];
  for (const sub of subsectors) {
    for (const v of sub.videos) {
      catalog.push({ id: v.id, title: v.title, kind: "VIDEO", subsector: sub.label });
    }
    for (const d of sub.documents) {
      catalog.push({ id: d.id, title: d.name, kind: "DOCUMENTO", subsector: sub.label });
    }
  }

  // Teto de pontos por tipo de formulário, para `total` ganhar escala.
  const maxTotalByType = new Map<string, number>();
  for (const t of typeScales) {
    const questions = t.sections.reduce((n, sec) => n + sec._count.questions, 0);
    if (questions > 0) maxTotalByType.set(t.id, questions * t.scaleMax);
  }

  const performanceByUser = new Map<string, MemberPerformanceEvaluation[]>();
  for (const e of performance) {
    const entries = performanceByUser.get(e.subjectId) ?? [];
    entries.push({
      id: e.id,
      title: e.type.title,
      total: e.total,
      maxTotal: e.total === null ? null : (maxTotalByType.get(e.type.id) ?? null),
      cycleLabel: e.cycle === null ? undefined : `Ciclo ${e.cycle}`,
      // O avaliador some do vínculo quando o cadastro dele é removido
      // (`onDelete: SetNull`): a avaliação continua valendo, sem o nome.
      evaluatorName: e.evaluator?.fullName ?? "—",
      selfAssessment: e.isSelfAssessment,
      createdAtLabel: dateLabelBR(e.createdAt),
    });
    performanceByUser.set(e.subjectId, entries);
  }

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
    const doneIds = doneIdsByUser.get(m.id) ?? new Set<string>();
    const pendingList = catalog.filter((item) => !doneIds.has(item.id));
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
      pending: pendingList.length,
      pendingList,
      evaluations: evaluationsByUser.get(m.id) ?? [],
      performance: performanceByUser.get(m.id) ?? [],
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
