import { prisma } from "@/lib/db/prisma";
import { DHO_SLUG } from "@/lib/auth/access";
import { dateLabelBR, timeLabelBR } from "@/lib/brasilia";
import {
  resolveGraders,
  type ComprehensionAuthor,
  type GraderCandidate,
} from "@/lib/video-comprehension-scope";
import type { Role } from "@/types";
import type {
  VideoComprehensionEntry,
  VideoComprehensionSubject,
  VideoComprehensionTask,
} from "@/types/evaluation";

function whenLabel(date: Date): string {
  return `${dateLabelBR(date)} às ${timeLabelBR(date)}`;
}

/**
 * Todos que PODEM avaliar alguma resposta: Gestores e Admins ativos, com a
 * lotação no DHO já resolvida. A escolha por resposta é da regra pura
 * (`resolveGraders`).
 */
export async function loadGraderCandidates(): Promise<GraderCandidate[]> {
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: ["GESTOR", "ADMIN"] } },
    select: {
      id: true,
      role: true,
      sectorId: true,
      sector: { select: { slug: true } },
      subsectors: { select: { subsector: { select: { slug: true } } } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    role: u.role as Role,
    sectorId: u.sectorId,
    dho:
      u.sector?.slug === DHO_SLUG ||
      u.subsectors.some((s: { subsector: { slug: string } }) => s.subsector.slug === DHO_SLUG),
  }));
}

const PENDING_SELECT = {
  id: true,
  answer: true,
  submittedAt: true,
  user: { select: { id: true, fullName: true, sectorId: true } },
  video: { select: { title: true, filePath: true } },
} as const;

/**
 * Respostas sem nota que cabem ao usuário avaliar — a tarefa "Compreensão de
 * vídeo" em Minhas Avaliações.
 */
export async function getPendingComprehensionTasks(
  graderId: string,
): Promise<VideoComprehensionTask[]> {
  const [pending, candidates] = await Promise.all([
    prisma.videoComprehension.findMany({
      where: { gradedAt: null },
      orderBy: { submittedAt: "asc" },
      select: PENDING_SELECT,
    }),
    loadGraderCandidates(),
  ]);

  const tasks: VideoComprehensionTask[] = [];
  for (const c of pending) {
    const author: ComprehensionAuthor = { authorId: c.user.id, authorSectorId: c.user.sectorId };
    if (!resolveGraders(author, candidates).some((g) => g.id === graderId)) continue;
    tasks.push({
      comprehensionId: c.id,
      authorName: c.user.fullName,
      videoTitle: c.video.title,
      videoPath: c.video.filePath ?? undefined,
      answer: c.answer,
      submittedAtLabel: whenLabel(c.submittedAt),
    });
  }
  return tasks;
}

/** Só a contagem, para o indicador da barra lateral. */
export async function countPendingComprehensionTasks(graderId: string): Promise<number> {
  return (await getPendingComprehensionTasks(graderId)).length;
}

/**
 * Resultados para o DHO: respostas já avaliadas, agrupadas por colaborador.
 * `sectors` recorta pelo rótulo do setor do autor (Gestor de fora do DHO);
 * nulo/vazio = todos.
 */
export async function getVideoComprehensionResults(
  sectors?: string[] | null,
): Promise<VideoComprehensionSubject[]> {
  const scoped = sectors && sectors.length > 0;
  const rows = await prisma.videoComprehension.findMany({
    where: {
      gradedAt: { not: null },
      ...(scoped ? { user: { sector: { label: { in: sectors } } } } : {}),
    },
    orderBy: { gradedAt: "desc" },
    select: {
      id: true,
      answer: true,
      submittedAt: true,
      grade: true,
      graderComment: true,
      gradedAt: true,
      user: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
      video: { select: { title: true } },
      gradedBy: { select: { fullName: true } },
    },
  });

  const bySubject = new Map<string, VideoComprehensionSubject>();
  for (const r of rows) {
    // `gradedAt` e `grade` não são nulos aqui (filtro acima); o TypeScript não
    // sabe disso.
    if (r.gradedAt == null || r.grade == null) continue;
    let subject = bySubject.get(r.user.id);
    if (!subject) {
      subject = {
        subjectId: r.user.id,
        subjectName: r.user.fullName,
        sector: r.user.sector?.label ?? "—",
        count: 0,
        average: 0,
        lastLabel: whenLabel(r.gradedAt),
        entries: [],
      };
      bySubject.set(r.user.id, subject);
    }
    const entry: VideoComprehensionEntry = {
      id: r.id,
      videoTitle: r.video.title,
      submittedAtLabel: whenLabel(r.submittedAt),
      answer: r.answer,
      grade: r.grade,
      graderName: r.gradedBy?.fullName ?? "—",
      gradedAtLabel: whenLabel(r.gradedAt),
      graderComment: r.graderComment ?? undefined,
    };
    subject.entries.push(entry);
    subject.count += 1;
  }

  const subjects = [...bySubject.values()];
  for (const s of subjects) {
    const sum = s.entries.reduce((acc, e) => acc + e.grade, 0);
    s.average = Math.round((sum / s.entries.length) * 10) / 10;
  }
  subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName, "pt-BR"));
  return subjects;
}
