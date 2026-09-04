import { prisma } from "@/lib/db/prisma";
import { notifyFormAvailable } from "@/lib/whatsapp/notify";
import { canEditStructure, canReopen, removalImpact, NO_SECTOR } from "./rules";
import type { RemovalImpact } from "./rules";
import type { Role } from "@/types";
import type { FormDraft } from "@/types/form";

/**
 * O trabalho das ações do construtor, sem a sessão.
 *
 * Separado de `actions.ts` por um motivo prático: lá o ator sai de
 * `getVerifiedSession()`, que lê o cookie da requisição e por isso não existe
 * fora de uma. Com o ator recebido por parâmetro, este arquivo roda num script
 * de teste contra um banco de verdade — e é exatamente o código que a aplicação
 * executa, não uma réplica dele.
 *
 * `actions.ts` fica com o que é do Next: resolver a sessão e revalidar rotas.
 */

export interface FormActor {
  id: string;
  role: Role;
  sectorId: string | null;
}

export interface CoreResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** saveForm: o que a gravação destruiria. Presente só quando ela é recusada. */
  removals?: RemovalImpact[];
  /** deleteForm: quantas respostas a exclusão levaria junto. */
  responseCount?: number;
}

/** Recorte por setor, na forma da cláusula `where`. ADMIN não recorta. */
export function scopeWhere(me: Pick<FormActor, "role" | "sectorId">) {
  return me.role === "ADMIN" ? {} : { ownerSectorId: me.sectorId ?? NO_SECTOR };
}

/** Formulário que o ator alcança, com o que as regras precisam saber dele. */
async function formInScope(formId: string, me: FormActor) {
  return prisma.form.findFirst({
    where: { id: formId, ...scopeWhere(me) },
    select: {
      id: true,
      status: true,
      currentRound: true,
      _count: { select: { responses: true } },
    },
  });
}

// ─── Salvar ────────────────────────────────────────────────────────────────

/**
 * Estrutura atual do formulário, só os ids e o que identifica cada linha.
 * É contra isto que o rascunho é comparado.
 */
async function currentStructure(formId: string) {
  const sections = await prisma.formSection.findMany({
    where: { formId },
    select: {
      id: true,
      questions: {
        select: { id: true, label: true, options: { select: { id: true, label: true } } },
      },
    },
  });
  return {
    sectionIds: sections.map((s) => s.id),
    questions: sections.flatMap((s) => s.questions.map((q) => ({ id: q.id, label: q.label }))),
    options: sections.flatMap((s) =>
      s.questions.flatMap((q) =>
        q.options.map((o) => ({ id: o.id, questionId: q.id, label: o.label })),
      ),
    ),
  };
}

/**
 * Conta o que se perde ao remover — e só do que está mesmo saindo.
 *
 * Contar a escolha de uma opção custa uma consulta por opção (`optionIds` é
 * array, não FK). Fazer isso para o formulário inteiro seria caro à toa: o que
 * fica não perde nada por definição, e `removalImpact` descartaria de qualquer
 * forma. Então só os candidatos à remoção são contados.
 */
async function costOfRemoving(
  formId: string,
  current: Awaited<ReturnType<typeof currentStructure>>,
  draft: FormDraft,
) {
  const questions = draft.sections.flatMap((s) => s.questions);
  const keptQuestions = new Set(questions.map((q) => q.id));
  const keptOptions = new Set(questions.flatMap((q) => q.options.map((o) => o.id)));

  const doomedQuestions = current.questions.filter((q) => !keptQuestions.has(q.id));
  const doomedOptions = current.options.filter((o) => !keptOptions.has(o.id));

  const [questionCounts, optionCounts] = await Promise.all([
    Promise.all(
      doomedQuestions.map(async (q) => ({
        ...q,
        answers: await prisma.formAnswer.count({ where: { questionId: q.id } }),
      })),
    ),
    Promise.all(
      doomedOptions.map(async (o) => ({
        ...o,
        chosen: await prisma.formAnswer.count({
          where: { optionIds: { has: o.id }, question: { section: { formId } } },
        }),
      })),
    ),
  ]);

  return { questions: questionCounts, options: optionCounts };
}

export async function saveFormFor(
  me: FormActor,
  input: { formId: string; draft: FormDraft; confirmRemovals?: boolean },
): Promise<CoreResult> {
  const existing = await formInScope(input.formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };
  if (!canEditStructure({ status: existing.status })) {
    return { ok: false, error: "Formulário encerrado. Reabra antes de editar." };
  }

  const { draft } = input;
  const current = await currentStructure(input.formId);
  const removals = removalImpact(await costOfRemoving(input.formId, current, draft), draft);

  // Nada se grava enquanto o usuário não vir o que perde. A tela reenvia com
  // confirmRemovals depois de perguntar.
  if (removals.length > 0 && !input.confirmRemovals) {
    return { ok: false, error: "Esta alteração apaga respostas.", removals };
  }

  const draftSectionIds = new Set(draft.sections.map((s) => s.id));
  const draftQuestions = draft.sections.flatMap((s) =>
    s.questions.map((q, i) => ({ ...q, sectionId: s.id, position: i })),
  );
  const draftQuestionIds = new Set(draftQuestions.map((q) => q.id));
  const draftOptionIds = new Set(draftQuestions.flatMap((q) => q.options.map((o) => o.id)));

  await prisma.$transaction(async (tx) => {
    await tx.form.update({
      where: { id: input.formId },
      data: { title: draft.title, description: draft.description || null },
    });

    // A ordem abaixo não é arbitrária. Primeiro tudo que fica é criado ou
    // atualizado NO LUGAR — é o que preserva as respostas das perguntas que
    // sobreviveram, e é a diferença em relação ao apagar-e-recriar de antes.
    // Só depois vem a remoção, e as seções por último: apagar uma seção antes
    // de mover as perguntas dela levaria junto, pelo cascade, pergunta que o
    // rascunho mantinha.
    for (const [order, section] of draft.sections.entries()) {
      const data = {
        title: section.title,
        description: section.description || null,
        order,
      };
      await tx.formSection.upsert({
        where: { id: section.id },
        update: data,
        // O id vem do rascunho, inclusive para os novos (crypto.randomUUID no
        // cliente). Assim o próximo salvamento reconhece a linha em vez de
        // recriá-la — que é o que faria a resposta se perder.
        create: { id: section.id, formId: input.formId, ...data },
      });
    }

    for (const question of draftQuestions) {
      const isScale = question.kind === "ESCALA_LINEAR";
      const data = {
        sectionId: question.sectionId,
        kind: question.kind,
        label: question.label,
        helpText: question.helpText || null,
        required: question.required,
        order: question.position,
        scaleMin: isScale ? (question.scaleMin ?? 1) : null,
        scaleMax: isScale ? (question.scaleMax ?? 5) : null,
        scaleMinLabel: question.scaleMinLabel || null,
        scaleMaxLabel: question.scaleMaxLabel || null,
      };
      await tx.formQuestion.upsert({
        where: { id: question.id },
        update: data,
        create: { id: question.id, ...data },
      });

      for (const [order, option] of question.options.entries()) {
        await tx.formOption.upsert({
          where: { id: option.id },
          update: { label: option.label, order },
          create: { id: option.id, questionId: question.id, label: option.label, order },
        });
      }
    }

    const goneOptions = current.options.filter((o) => !draftOptionIds.has(o.id));
    if (goneOptions.length > 0) {
      await tx.formOption.deleteMany({ where: { id: { in: goneOptions.map((o) => o.id) } } });
    }

    const goneQuestions = current.questions.filter((q) => !draftQuestionIds.has(q.id));
    if (goneQuestions.length > 0) {
      await tx.formQuestion.deleteMany({ where: { id: { in: goneQuestions.map((q) => q.id) } } });
    }

    const goneSections = current.sectionIds.filter((id) => !draftSectionIds.has(id));
    if (goneSections.length > 0) {
      await tx.formSection.deleteMany({ where: { id: { in: goneSections } } });
    }
  });

  return { ok: true };
}

// ─── Publicar, encerrar, reabrir, excluir ──────────────────────────────────

export async function publishFormFor(
  me: FormActor,
  input: {
    formId: string;
    userIds: string[];
    sectorIds: string[];
    anonymous: boolean;
    dueAt?: string;
  },
): Promise<CoreResult> {
  const existing = await formInScope(input.formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };
  if (existing.status !== "RASCUNHO") {
    return { ok: false, error: "Este formulário já foi publicado." };
  }

  // O GESTOR só alcança gente do próprio setor. A cláusula é aplicada aqui, não
  // confiando no que a tela mandou.
  const recipients = await prisma.user.findMany({
    where: {
      active: true,
      ...(me.role === "ADMIN" ? {} : { sectorId: me.sectorId ?? NO_SECTOR }),
      OR: [{ id: { in: input.userIds } }, { sectorId: { in: input.sectorIds } }],
    },
    select: { id: true },
  });

  if (recipients.length === 0) {
    return { ok: false, error: "Escolha ao menos um destinatário." };
  }

  await prisma.$transaction([
    prisma.form.update({
      where: { id: input.formId },
      data: {
        status: "PUBLICADO",
        anonymous: input.anonymous,
        publishedAt: new Date(),
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
    }),
    prisma.formAssignment.createMany({
      data: recipients.map((r) => ({ formId: input.formId, userId: r.id })),
      skipDuplicates: true,
    }),
  ]);

  // Depois do commit: a transação acima é que define quem é destinatário, e
  // avisar antes dela avisaria sobre um formulário que pode não ter publicado.
  await notifyFormAvailable(input.formId);

  return { ok: true };
}

export async function closeFormFor(me: FormActor, formId: string): Promise<CoreResult> {
  const existing = await formInScope(formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };

  await prisma.form.update({
    where: { id: formId },
    data: { status: "ENCERRADO", closedAt: new Date() },
  });
  return { ok: true };
}

/**
 * Reabrir recomeça a coleta.
 *
 * Incrementa a rodada e devolve TODAS as atribuições a PENDENTE — inclusive as
 * de quem já respondeu, porque é uma coleta nova e não a continuação da
 * anterior. As respostas antigas não são tocadas: ficam com o número da rodada
 * em que foram dadas, e é assim que o resultado anterior continua consultável.
 */
export async function reopenFormFor(me: FormActor, formId: string): Promise<CoreResult> {
  const existing = await formInScope(formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };
  if (!canReopen({ status: existing.status })) {
    return { ok: false, error: "Só um formulário encerrado pode ser reaberto." };
  }

  await prisma.$transaction([
    prisma.form.update({
      where: { id: formId },
      data: {
        status: "PUBLICADO",
        closedAt: null,
        currentRound: { increment: 1 },
      },
    }),
    prisma.formAssignment.updateMany({
      where: { formId },
      data: { status: "PENDENTE", respondedAt: null },
    }),
  ]);

  // Reabrir é coleta nova: todo mundo volta a pendente, e todo mundo é avisado
  // de novo. Sem isto a rodada nova começaria em silêncio, e quem já tinha
  // respondido não teria motivo nenhum para voltar à tela.
  await notifyFormAvailable(formId);

  return { ok: true };
}

/** A palavra que destrava a exclusão de um formulário com respostas. */
export const DELETE_CONFIRMATION = "APAGAR";

/**
 * Excluir é definitivo e leva tudo: o cascade do schema arrasta seções,
 * perguntas, opções, atribuições e respostas. Uma linha apaga a árvore inteira
 * — e é por isso que o freio, quando há respostas, é digitado e não clicado.
 */
export async function deleteFormFor(
  me: FormActor,
  input: { formId: string; confirmation?: string },
): Promise<CoreResult> {
  const existing = await formInScope(input.formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };

  const responseCount = existing._count.responses;
  if (responseCount > 0 && input.confirmation !== DELETE_CONFIRMATION) {
    return {
      ok: false,
      error: `Este formulário tem ${responseCount} resposta(s). Digite ${DELETE_CONFIRMATION} para confirmar.`,
      responseCount,
    };
  }

  await prisma.form.delete({ where: { id: input.formId } });
  return { ok: true, responseCount };
}

export async function listRecipientsFor(me: FormActor): Promise<{
  users: { id: string; name: string; sector: string }[];
  sectors: { id: string; label: string }[];
}> {
  const scoped = me.role === "ADMIN" ? {} : { sectorId: me.sectorId ?? NO_SECTOR };

  const [users, sectors] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, ...scoped },
      select: { id: true, fullName: true, sector: { select: { label: true } } },
      orderBy: { fullName: "asc" },
    }),
    me.role === "ADMIN"
      ? prisma.sector.findMany({ select: { id: true, label: true }, orderBy: { order: "asc" } })
      : prisma.sector.findMany({
          where: { id: me.sectorId ?? NO_SECTOR },
          select: { id: true, label: true },
        }),
  ]);

  return {
    users: users.map((u) => ({ id: u.id, name: u.fullName, sector: u.sector?.label ?? "—" })),
    sectors,
  };
}
