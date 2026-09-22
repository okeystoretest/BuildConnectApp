import { prisma } from "@/lib/db/prisma";
import { dateLabelBR, timeLabelBR } from "@/lib/brasilia";
import { isPassing } from "@/lib/video-comprehension";
import type { AnsweredEvaluation } from "@/types/evaluation";

/**
 * O que ESTE usuário já respondeu, para a aba "Concluídas" de Minhas
 * Avaliações.
 *
 * O princípio é o espelho: cada origem aqui corresponde a um tipo de
 * `getMyEvaluationTasks`. O que sai da aba de pendências aparece na de
 * concluídas, e uma resposta enviada nunca fica sem lugar nenhum.
 *
 * Tudo é recortado por AUTORIA — `evaluatorId`, `respondentId`, `gradedById`
 * são sempre o próprio usuário. Esta consulta não tem recorte de papel porque
 * não precisa de um: ninguém alcança a resposta de outra pessoa por aqui,
 * qualquer que seja o cargo.
 *
 * Formulário ANÔNIMO não guarda quem respondeu (`respondentId` nulo, por
 * desenho), então essas respostas não aparecem para ninguém — nem para quem
 * as escreveu. A tela diz isso em vez de deixar a pessoa achar que perdeu o
 * que enviou.
 */
export async function getMyAnsweredEvaluations(userId: string): Promise<AnsweredEvaluation[]> {
  const [submissions, responses, grades] = await Promise.all([
    // Rodadas: feedbacks que dei e minha autoavaliação. As duas gravam
    // `evaluatorId`, então uma consulta cobre ambas.
    prisma.evaluation.findMany({
      where: { evaluatorId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        total: true,
        isSelfAssessment: true,
        type: { select: { title: true } },
        subject: { select: { fullName: true } },
        _count: { select: { answers: true } },
      },
    }),
    prisma.formResponse.findMany({
      where: { respondentId: userId },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        submittedAt: true,
        round: true,
        form: { select: { title: true } },
        _count: { select: { answers: true } },
      },
    }),
    // Notas que dei como Gestor a respostas de compreensão da equipe.
    prisma.videoComprehension.findMany({
      where: { gradedById: userId, gradedAt: { not: null } },
      orderBy: { gradedAt: "desc" },
      select: {
        id: true,
        gradedAt: true,
        grade: true,
        graderComment: true,
        video: { select: { title: true } },
        user: { select: { fullName: true } },
      },
    }),
  ]);

  const rows: (AnsweredEvaluation & { at: Date })[] = [];

  for (const s of submissions) {
    rows.push({
      at: s.createdAt,
      id: s.id,
      kind: s.isSelfAssessment ? "AUTOAVALIACAO" : "FEEDBACK",
      title: s.type.title,
      subjectName: s.isSelfAssessment ? "Você" : s.subject.fullName,
      answeredAtLabel: dateLabelBR(s.createdAt),
      answeredAtTimeLabel: timeLabelBR(s.createdAt),
      // O máximo depende da escala do instrumento e não vale uma consulta a
      // mais na listagem: o total sozinho já diferencia as submissões, e o
      // detalhe traz a conta completa.
      scoreLabel: s.total == null ? undefined : `${s.total} pts`,
    });
  }

  for (const r of responses) {
    rows.push({
      at: r.submittedAt,
      id: r.id,
      kind: "FORMULARIO",
      title: r.form.title,
      answeredAtLabel: dateLabelBR(r.submittedAt),
      answeredAtTimeLabel: timeLabelBR(r.submittedAt),
      scoreLabel: `${r._count.answers} ${r._count.answers === 1 ? "resposta" : "respostas"}`,
    });
  }

  for (const g of grades) {
    // `gradedAt` e `grade` não são nulos aqui (o filtro garante); o TypeScript
    // não tem como saber.
    if (g.gradedAt == null || g.grade == null) continue;
    rows.push({
      at: g.gradedAt,
      id: g.id,
      kind: "COMPREENSAO_VIDEO",
      title: g.video.title,
      subjectName: g.user.fullName,
      answeredAtLabel: dateLabelBR(g.gradedAt),
      answeredAtTimeLabel: timeLabelBR(g.gradedAt),
      scoreLabel: `${g.grade}/10`,
      comprehension: {
        videoTitle: g.video.title,
        authorName: g.user.fullName,
        grade: g.grade,
        comment: g.graderComment ?? undefined,
        passed: isPassing(g.grade),
      },
    });
  }

  // Uma linha do tempo só: as quatro origens misturadas, da mais recente para
  // a mais antiga. Separar por tipo obrigaria a pessoa a lembrar em que aba
  // respondeu, que é exatamente o que ela veio aqui descobrir.
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  // `at` é a chave de ordenação e morre aqui: o DTO carrega os rótulos já
  // formatados, e uma Date atravessando a fronteira do servidor só serviria
  // para alguém formatá-la de novo no fuso do navegador.
  return rows.map((row) => {
    const copy: AnsweredEvaluation & { at?: Date } = { ...row };
    delete copy.at;
    return copy as AnsweredEvaluation;
  });
}
