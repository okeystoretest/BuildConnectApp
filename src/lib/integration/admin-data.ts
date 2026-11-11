import { prisma } from "@/lib/db/prisma";
import { accessClosed, guestColumn } from "./access";
import { dateLabelBR } from "@/lib/brasilia";
import { scoreLabel } from "./grade";
import type {
  GuestAttemptDetail,
  GuestCard,
  IntegrationAdminData,
  IntegrationAssetRow,
} from "@/types/integration";

/**
 * Leitura do quadro "Página de Integração" no DHO.
 *
 * Só é chamada de dentro da página do DHO, que já barrou quem não administra
 * o setor (`canAdministerDho`). A guarda não se repete aqui porque a página
 * não renderiza o quadro para mais ninguém — e repetir uma guarda em dois
 * lugares é como elas divergem.
 */
export async function getIntegrationAdmin(): Promise<IntegrationAdminData> {
  const [assets, guests, filmCount] = await Promise.all([
    prisma.integrationAsset.findMany({
      orderBy: [{ kind: "asc" }, { order: "asc" }],
      select: {
        id: true,
        kind: true,
        title: true,
        focus: true,
        lesson: true,
        filePath: true,
        thumbnailPath: true,
        order: true,
        _count: { select: { questions: true } },
      },
    }),
    prisma.integrationGuest.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        fullName: true,
        phone: true,
        confirmedAt: true,
        revokedAt: true,
        completedAt: true,
        accessUntil: true,
        createdAt: true,
        createdBy: { select: { fullName: true } },
        attempts: { select: { assetId: true, passed: true } },
      },
    }),
    prisma.integrationAsset.count({ where: { kind: "FILME" } }),
  ]);

  const assetRows: IntegrationAssetRow[] = assets.map((a) => ({
    id: a.id,
    kind: a.kind as IntegrationAssetRow["kind"],
    title: a.title,
    focus: a.focus ?? undefined,
    lesson: a.lesson ?? undefined,
    hasFile: a.filePath !== null,
    hasCover: a.thumbnailPath !== null,
    order: a.order,
    questionCount: a._count.questions,
  }));

  const now = new Date();

  const guestCards: GuestCard[] = guests.map((g) => {
    // Filmes DISTINTOS aprovados: reprovar e acertar depois não conta duas
    // vezes, e refazer um filme já aprovado também não. Serve ao "x de y" do
    // card; quem decide a coluna é `completedAt`.
    const approved = new Set(g.attempts.filter((a) => a.passed).map((a) => a.assetId));
    const failedCount = g.attempts.filter((a) => !a.passed).length;

    return {
      id: g.id,
      fullName: g.fullName,
      phone: g.phone,
      confirmed: g.confirmedAt !== null,
      // "Encerrado" é sobre o ACESSO, não sobre a trilha: vale tanto para a
      // revogação do DHO quanto para a janela de 24 h vencida.
      revoked: accessClosed(g, now),
      // Sai do fato gravado, nunca de recontar filmes aprovados — era a
      // recontagem que devolvia a pendente quem já tinha terminado assim que
      // um filme novo entrava na trilha.
      column: guestColumn(g.completedAt, now),
      approvedCount: approved.size,
      filmCount,
      failedCount,
      invitedAtLabel: dateLabelBR(g.createdAt),
      completedAtLabel: g.completedAt ? dateLabelBR(g.completedAt) : null,
      createdByName: g.createdBy?.fullName ?? "—",
      token: g.token,
    };
  });

  return { assets: assetRows, guests: guestCards };
}

/**
 * As tentativas de UM convidado, pergunta a pergunta (item 1 do escopo de
 * refatoração: o card da coluna final abre o detalhe).
 *
 * Lida sob demanda, ao abrir a pessoa: carregar as respostas de todos junto
 * com o quadro seria puxar o questionário inteiro de cada um para exibir uma
 * linha com o nome.
 *
 * Mostra o que foi marcado E o que era o certo — é o que permite ao DHO
 * entender onde a mensagem do filme não chegou, em vez de só ver um "errou".
 */
export async function getGuestAttempts(guestId: string): Promise<GuestAttemptDetail[]> {
  const attempts = await prisma.integrationAttempt.findMany({
    where: { guestId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      correctCount: true,
      totalCount: true,
      passed: true,
      createdAt: true,
      asset: { select: { title: true } },
      answers: {
        select: {
          option: { select: { id: true, label: true } },
          question: {
            select: {
              label: true,
              order: true,
              options: { where: { correct: true }, select: { id: true, label: true } },
            },
          },
        },
      },
    },
  });

  return attempts.map((attempt) => ({
    id: attempt.id,
    filmTitle: attempt.asset.title,
    scoreLabel: scoreLabel(attempt.correctCount, attempt.totalCount),
    passed: attempt.passed,
    submittedAtLabel: dateLabelBR(attempt.createdAt),
    answers: [...attempt.answers]
      .sort((a, b) => a.question.order - b.question.order)
      .map((answer) => {
        const gabarito = answer.question.options[0];
        return {
          question: answer.question.label,
          answer: answer.option.label,
          correct: gabarito?.id === answer.option.id,
          expected: gabarito?.label ?? "—",
        };
      }),
  }));
}
