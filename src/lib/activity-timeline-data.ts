import { prisma } from "@/lib/db/prisma";
import {
  ACTIVITY_PAGE_SIZE,
  activityId,
  mergeActivity,
  type ActivityCursor,
  type ActivityItem,
} from "@/lib/activity-timeline";

/**
 * As nove consultas da linha do tempo, e o texto de cada evento.
 *
 * Oito origens são derivadas de tabelas que já existem; a nona é
 * `ActivityEvent`, com login e logout. Todas pedem UMA LINHA ALÉM da página
 * (`TAKE`): é o que permite a `mergeActivity` saber, sem chutar, se sobrou
 * evento — ver o comentário dela.
 *
 * Os textos são montados aqui, e não na tela: é do lado do servidor que estão
 * os títulos de vídeo, os códigos de chamado e os nomes, e mandá-los como
 * frase pronta evita o componente ter de saber o que é uma rodada de Eficácia.
 */
const TAKE = ACTIVITY_PAGE_SIZE + 1;

/**
 * Teto de data das consultas. Sem cursor, não há teto.
 *
 * `lte` e não `lt`: o evento empatado no milissegundo exato do cursor tem de
 * VOLTAR na consulta para a fusão poder decidir se ele já foi exibido. Cortar
 * com `lt` no banco o perderia antes de alguém olhar.
 */
function ceiling(cursor?: ActivityCursor | null) {
  return cursor ? { lte: new Date(cursor.occurredAt) } : undefined;
}

export async function getActivityPage(input: {
  userId: string;
  cursor?: ActivityCursor | null;
}): Promise<{ events: ActivityItem[]; nextCursor: ActivityCursor | null }> {
  const { userId, cursor } = input;
  const window = ceiling(cursor);

  const [user, logged, watched, comprehensions, ratings, assignments, rounds, evaluations, tickets] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, createdAt: true },
      }),
      prisma.activityEvent.findMany({
        where: { userId, occurredAt: window },
        orderBy: { occurredAt: "desc" },
        take: TAKE,
        select: { id: true, kind: true, occurredAt: true },
      }),
      /*
       * Vídeo assistido. Os dois filtros são necessários: `ContentProgress`
       * serve vídeo E documento, e `endedAt` é nulo nos documentos por
       * definição do schema. Sem eles, documento lido viraria "vídeo
       * assistido" sem data.
       */
      prisma.contentProgress.findMany({
        where: { userId, videoId: { not: null }, endedAt: { not: null, ...window } },
        orderBy: { endedAt: "desc" },
        take: TAKE,
        select: { id: true, endedAt: true, video: { select: { title: true } } },
      }),
      prisma.videoComprehension.findMany({
        where: { userId, submittedAt: window },
        orderBy: { submittedAt: "desc" },
        take: TAKE,
        select: {
          id: true,
          submittedAt: true,
          attempt: true,
          video: { select: { title: true } },
        },
      }),
      prisma.videoRating.findMany({
        where: { userId, createdAt: window },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: { id: true, createdAt: true, video: { select: { title: true } } },
      }),
      // Designado para AVALIAR outra pessoa.
      prisma.evaluationAssignment.findMany({
        where: { raterId: userId, createdAt: window },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: {
          id: true,
          createdAt: true,
          round: {
            select: {
              type: { select: { title: true } },
              subject: { select: { fullName: true } },
            },
          },
        },
      }),
      // Avaliação ABERTA SOBRE ele.
      prisma.evaluationRound.findMany({
        where: { subjectId: userId, createdAt: window },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: { id: true, createdAt: true, type: { select: { title: true } } },
      }),
      // Avaliação que ELE respondeu. `evaluatorId` cobre a autoavaliação
      // também: no autopreenchimento, quem responde é o próprio sujeito.
      prisma.evaluation.findMany({
        where: { evaluatorId: userId, status: "CONCLUIDA", createdAt: window },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: {
          id: true,
          createdAt: true,
          cycle: true,
          total: true,
          isSelfAssessment: true,
          type: { select: { title: true } },
          subject: { select: { fullName: true } },
        },
      }),
      prisma.ticket.findMany({
        where: { requesterId: userId, createdAt: window },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: { id: true, code: true, title: true, destination: true, createdAt: true },
      }),
    ]);

  if (!user) return { events: [], nextCursor: null };

  // O cadastro é uma linha só, não uma consulta paginada: uma pessoa tem uma
  // data de cadastro, e ela é sempre o evento mais antigo da linha do tempo.
  const cadastro: ActivityItem[] = [
    {
      id: activityId("CADASTRO", user.id),
      kind: "CADASTRO",
      occurredAt: user.createdAt,
      title: "Cadastro criado",
    },
  ];

  const sessoes: ActivityItem[] = logged.map((row) => ({
    id: activityId(row.kind, row.id),
    kind: row.kind,
    occurredAt: row.occurredAt,
    title: row.kind === "LOGIN" ? "Entrou na plataforma" : "Saiu da plataforma",
  }));

  const assistidos: ActivityItem[] = watched.map((row) => ({
    id: activityId("VIDEO_ASSISTIDO", row.id),
    kind: "VIDEO_ASSISTIDO",
    // O filtro da consulta garante não nulo; o tipo gerado não sabe disso.
    occurredAt: row.endedAt as Date,
    title: "Assistiu ao vídeo",
    detail: row.video?.title,
  }));

  const respostas: ActivityItem[] = comprehensions.map((row) => ({
    id: activityId("RESPOSTA_COMPREENSAO", row.id),
    kind: "RESPOSTA_COMPREENSAO",
    occurredAt: row.submittedAt,
    title: "Respondeu à compreensão do vídeo",
    // Tentativa só a partir da 2ª: marcar "tentativa 1" em todo registro seria
    // ruído, como já se faz no card de Meu Setor.
    detail: row.attempt > 1 ? `${row.video.title} · tentativa ${row.attempt}` : row.video.title,
  }));

  const avaliacoesVideo: ActivityItem[] = ratings.map((row) => ({
    id: activityId("AVALIACAO_VIDEO", row.id),
    kind: "AVALIACAO_VIDEO",
    occurredAt: row.createdAt,
    title: "Avaliou a qualidade do vídeo",
    detail: row.video.title,
  }));

  const designadas: ActivityItem[] = assignments.map((row) => ({
    id: activityId("AVALIACAO_DESIGNADA", row.id),
    kind: "AVALIACAO_DESIGNADA",
    occurredAt: row.createdAt,
    title: "Designado para avaliar",
    detail: `${row.round.type.title} · ${row.round.subject.fullName}`,
  }));

  const abertas: ActivityItem[] = rounds.map((row) => ({
    id: activityId("AVALIACAO_ABERTA", row.id),
    kind: "AVALIACAO_ABERTA",
    occurredAt: row.createdAt,
    title: "Avaliação aberta sobre ele",
    detail: row.type.title,
  }));

  const respondidas: ActivityItem[] = evaluations.map((row) => {
    const partes = [row.type.title];
    if (row.cycle !== null) partes.push(`ciclo ${row.cycle}`);
    if (row.total !== null) partes.push(`${row.total} pontos`);
    // Sujeito removido do cadastro deixa o vínculo nulo: a avaliação continua
    // valendo, sem o nome.
    if (!row.isSelfAssessment) partes.push(row.subject?.fullName ?? "—");
    return {
      id: activityId("AVALIACAO_RESPONDIDA", row.id),
      kind: "AVALIACAO_RESPONDIDA" as const,
      occurredAt: row.createdAt,
      title: row.isSelfAssessment ? "Respondeu à autoavaliação" : "Respondeu a uma avaliação",
      detail: partes.join(" · "),
    };
  });

  const chamados: ActivityItem[] = tickets.map((row) => ({
    id: activityId("CHAMADO_ABERTO", row.id),
    kind: "CHAMADO_ABERTO",
    occurredAt: row.createdAt,
    title: `Abriu chamado ${row.code}`,
    detail: `${row.title} · ${row.destination === "TI" ? "TI" : "Motoristas"}`,
  }));

  return mergeActivity(
    [
      cadastro,
      sessoes,
      assistidos,
      respostas,
      avaliacoesVideo,
      designadas,
      abertas,
      respondidas,
      chamados,
    ],
    cursor,
  );
}
