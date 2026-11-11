import { prisma } from "@/lib/db/prisma";
import type { QuestionDraft, QuestionRemoval, SaveQuestionsResult } from "@/types/integration";

/**
 * Edição do questionário de um filme, sem a sessão.
 *
 * Mesma separação do resto do módulo: com o ator conferido por quem chama,
 * isto roda em teste contra um banco de verdade.
 *
 * O que torna esta edição delicada é a mesma coisa que torna delicada a do
 * construtor de formulários: as alternativas já escolhidas por alguém apontam
 * para estas linhas. Apagar uma alternativa apaga as respostas que a
 * marcaram, e o histórico de tentativas do convidado fica com buracos. Então
 * a regra é a mesma que `lib/forms/core.ts` usa: atualiza NO LUGAR o que fica,
 * e só recusa — dizendo exatamente o que se perde — quando a gravação
 * destruiria resposta.
 *
 * A NOTA JÁ DADA NÃO MUDA. `IntegrationAttempt` guarda acertos e total do
 * momento do envio, não um ponteiro para o gabarito. Corrigir uma alternativa
 * hoje não reprova retroativamente quem passou ontem — e é o comportamento
 * certo: a pessoa respondeu o que estava escrito na tela dela.
 */

export interface QuestionsDraftView {
  questions: (QuestionDraft & { id: string })[];
}

/** O questionário de um filme como o editor do DHO o recebe, COM gabarito. */
export async function readQuestions(assetId: string): Promise<QuestionsDraftView> {
  const questions = await prisma.integrationQuestion.findMany({
    where: { assetId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      label: true,
      options: {
        orderBy: { order: "asc" },
        select: { id: true, label: true, correct: true },
      },
    },
  });

  return { questions };
}

/** Recusa com mensagem pronta, ou null quando o rascunho é válido. */
function validate(draft: readonly QuestionDraft[]): string | null {
  for (const [i, question] of draft.entries()) {
    const n = i + 1;
    if (question.label.trim().length < 5) {
      return `Pergunta ${n}: escreva o enunciado.`;
    }
    const options = question.options.filter((o) => o.label.trim().length > 0);
    if (options.length < 2) {
      return `Pergunta ${n}: precisa de pelo menos duas alternativas.`;
    }
    if (options.length > 6) {
      return `Pergunta ${n}: no máximo seis alternativas.`;
    }
    const corretas = options.filter((o) => o.correct).length;
    // Zero correta é um filme que ninguém consegue passar; duas é uma nota que
    // depende de qual das duas a pessoa marcou. As duas falham em silêncio na
    // hora da correção, então a recusa é aqui.
    if (corretas !== 1) {
      return `Pergunta ${n}: marque exatamente uma alternativa correta.`;
    }
  }
  return null;
}

/** O que a gravação destruiria — só o que leva resposta junto. */
async function removalImpact(
  assetId: string,
  draft: readonly QuestionDraft[],
): Promise<QuestionRemoval[]> {
  const atuais = await prisma.integrationQuestion.findMany({
    where: { assetId },
    select: { id: true, label: true, options: { select: { id: true, label: true } } },
  });

  const ficamPerguntas = new Set(draft.map((q) => q.id).filter(Boolean));
  const ficamOpcoes = new Set(
    draft.flatMap((q) => q.options.map((o) => o.id).filter(Boolean)),
  );

  const perguntasQueSaem = atuais.filter((q) => !ficamPerguntas.has(q.id));
  const opcoesQueSaem = atuais
    // Alternativa de pergunta que também sai já foi contada na linha da
    // pergunta; listá-la de novo contaria a mesma perda duas vezes.
    .filter((q) => ficamPerguntas.has(q.id))
    .flatMap((q) => q.options.filter((o) => !ficamOpcoes.has(o.id)));

  const [porPergunta, porOpcao] = await Promise.all([
    Promise.all(
      perguntasQueSaem.map(async (q) => ({
        kind: "pergunta" as const,
        label: q.label,
        affected: await prisma.integrationAnswer.count({ where: { questionId: q.id } }),
      })),
    ),
    Promise.all(
      opcoesQueSaem.map(async (o) => ({
        kind: "alternativa" as const,
        label: o.label,
        affected: await prisma.integrationAnswer.count({ where: { optionId: o.id } }),
      })),
    ),
  ]);

  // Só entra o que leva dado junto: avisar sobre uma pergunta que ninguém
  // respondeu é ruído, e ruído faz o aviso que importa ser ignorado.
  return [...porPergunta, ...porOpcao].filter((r) => r.affected > 0);
}

export async function saveQuestionsFor(
  assetId: string,
  draft: readonly QuestionDraft[],
  confirmRemovals = false,
): Promise<SaveQuestionsResult> {
  const filme = await prisma.integrationAsset.findFirst({
    where: { id: assetId, kind: "FILME" },
    select: { id: true },
  });
  if (!filme) return { ok: false, error: "Filme não encontrado." };

  const erro = validate(draft);
  if (erro) return { ok: false, error: erro };

  const removals = await removalImpact(assetId, draft);
  if (removals.length > 0 && !confirmRemovals) {
    return { ok: false, error: "Esta alteração apaga respostas já enviadas.", removals };
  }

  await prisma.$transaction(async (tx) => {
    const ficamPerguntas: string[] = [];
    const ficamOpcoes: string[] = [];

    for (const [index, question] of draft.entries()) {
      const dados = { assetId, label: question.label.trim(), order: index };

      // Atualiza NO LUGAR o que já existe: é isso que preserva as respostas
      // das perguntas que sobreviveram. Apagar e recriar perderia todas.
      const id = question.id
        ? (await tx.integrationQuestion.update({ where: { id: question.id }, data: dados })).id
        : (await tx.integrationQuestion.create({ data: dados })).id;
      ficamPerguntas.push(id);

      const options = question.options.filter((o) => o.label.trim().length > 0);
      for (const [ordem, option] of options.entries()) {
        const dadosOpcao = {
          questionId: id,
          label: option.label.trim(),
          order: ordem,
          correct: option.correct,
        };
        const optionId = option.id
          ? (await tx.integrationOption.update({ where: { id: option.id }, data: dadosOpcao })).id
          : (await tx.integrationOption.create({ data: dadosOpcao })).id;
        ficamOpcoes.push(optionId);
      }
    }

    // A remoção vem DEPOIS de tudo que fica estar gravado.
    await tx.integrationOption.deleteMany({
      where: { question: { assetId }, id: { notIn: ficamOpcoes } },
    });
    await tx.integrationQuestion.deleteMany({
      where: { assetId, id: { notIn: ficamPerguntas } },
    });
  });

  return { ok: true };
}
