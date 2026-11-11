import { prisma } from "@/lib/db/prisma";
import { accessDeadline } from "./access";
import { correctSubmission } from "./grade";
import { getTrail } from "./data";
import { notifyGuestRetry } from "@/lib/whatsapp/notify";
import type { SubmitResult } from "@/types/integration";

/**
 * O trabalho do convidado, sem o cookie.
 *
 * Mesma separação de `lib/forms/core.ts`, e pelo mesmo motivo: com o convidado
 * recebido por parâmetro, isto roda num teste contra um banco de verdade — e é
 * exatamente o código que a aplicação executa, não uma réplica dele.
 *
 * `public-actions.ts` fica com o que é do Next: resolver o cookie e aplicar os
 * tetos por IP.
 */

/**
 * Conclui um filme SEM questionário (o vídeo chegou ao fim).
 *
 * Grava uma tentativa aprovada de zero perguntas. Parece estranho à primeira
 * vista, e é deliberado: a conclusão de um filme tem UMA representação só
 * (tentativa aprovada), então a trilha, o quadro do DHO e o fechamento do
 * convite leem todos a mesma coisa. Uma tabela de progresso à parte seria uma
 * segunda verdade sobre o mesmo fato — e as duas divergem no primeiro bug.
 */
export async function concludeFilmFor(
  guestId: string,
  assetId: string,
): Promise<SubmitResult> {
  const trail = await getTrail(guestId);
  const film = trail.find((f) => f.id === assetId);
  if (!film) return { ok: false, error: "Filme não encontrado." };
  if (film.state === "CONCLUIDO") return { ok: true, passed: true };
  if (film.state === "TRANCADO") {
    return { ok: false, error: "Assista os filmes anteriores primeiro." };
  }
  if (film.questions.length > 0) {
    return { ok: false, error: "Responda o questionário para concluir este filme." };
  }

  await prisma.integrationAttempt.create({
    data: { guestId, assetId, correctCount: 0, totalCount: 0, passed: true },
  });

  return finishIfDone(guestId, { ok: true, passed: true });
}

/**
 * Envio do questionário de um filme.
 *
 * Corrige contra o gabarito NO SERVIDOR — o navegador nunca recebeu qual é a
 * alternativa certa (ver `getTrail`), então não há o que conferir do lado de
 * lá nem o que forjar do lado de cá.
 *
 * Reprovado NÃO conclui o filme: a tentativa fica gravada, a trilha continua
 * onde estava e o convidado recebe a cobrança por WhatsApp. É o que o escopo
 * pede — "assista ao filme e responda novamente".
 */
export async function submitQuizFor(
  guestId: string,
  assetId: string,
  chosen: ReadonlyMap<string, string>,
): Promise<SubmitResult> {
  const trail = await getTrail(guestId);
  const film = trail.find((f) => f.id === assetId);
  if (!film) return { ok: false, error: "Filme não encontrado." };
  if (film.state === "CONCLUIDO") {
    return { ok: false, error: "Você já concluiu este filme." };
  }
  if (film.state === "TRANCADO") {
    return { ok: false, error: "Assista os filmes anteriores primeiro." };
  }

  // O gabarito é lido AQUI, e só aqui. `getTrail` entrega as perguntas sem ele.
  const questions = await prisma.integrationQuestion.findMany({
    where: { assetId },
    orderBy: { order: "asc" },
    select: { id: true, options: { select: { id: true, correct: true } } },
  });
  if (questions.length === 0) {
    return { ok: false, error: "Este filme não tem questionário." };
  }

  const { correctCount, totalCount, passed } = correctSubmission(questions, chosen);

  // Só entra resposta de opção que PERTENCE à pergunta: a FK recusaria um id
  // inventado, mas recusaria com erro de banco, e a correção já tratou o caso
  // como erro. Gravar só o que casa mantém as duas visões de acordo.
  const validas = questions.flatMap((question) => {
    const optionId = chosen.get(question.id);
    if (!optionId || !question.options.some((o) => o.id === optionId)) return [];
    return [{ questionId: question.id, optionId }];
  });

  await prisma.integrationAttempt.create({
    data: {
      guestId,
      assetId,
      correctCount,
      totalCount,
      passed,
      answers: { create: validas },
    },
  });

  if (!passed) {
    // Fora da transação e sem travar a resposta: a cobrança é um efeito, e o
    // WhatsApp fora do ar não pode transformar "você precisa rever o filme"
    // num erro de tela.
    await notifyGuestRetry(guestId);
    return { ok: false, error: undefined, correctCount, totalCount, passed };
  }

  return finishIfDone(guestId, { ok: true, correctCount, totalCount, passed });
}

/**
 * Terminou a trilha com aproveitamento? Então a conclusão fica GRAVADA e o
 * acesso ganha prazo.
 *
 * Reprovar numa tentativa e acertar na seguinte não atrapalha; o que impede é
 * faltar filme aprovado.
 *
 * Até 03/11/2026 isto escrevia `revokedAt` na hora, e o resultado era ruim dos
 * dois lados: o convidado terminava o quarto filme e recebia um 404 no lugar
 * de qualquer encerramento, e o quadro do DHO o mostrava como "Encerrado" em
 * vez de concluído. Agora o convite segue de pé por 24 h — tempo de rever o
 * que assistiu — e fecha sozinho pela comparação de data em `access.ts`.
 *
 * `completedAt: null` no filtro é o que torna isto idempotente: refazer um
 * filme já aprovado não reinicia a janela nem reescreve a data da conclusão.
 */
async function finishIfDone(guestId: string, result: SubmitResult): Promise<SubmitResult> {
  const [filmCount, approved] = await Promise.all([
    prisma.integrationAsset.count({ where: { kind: "FILME" } }),
    prisma.integrationAttempt.findMany({
      where: { guestId, passed: true },
      select: { assetId: true },
      distinct: ["assetId"],
    }),
  ]);

  if (filmCount === 0 || approved.length < filmCount) return result;

  const now = new Date();
  await prisma.integrationGuest.updateMany({
    where: { id: guestId, completedAt: null },
    data: { completedAt: now, accessUntil: accessDeadline(now) },
  });

  return { ...result, finished: true };
}
