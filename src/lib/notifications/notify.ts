import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Os gatilhos do sino — espelho de `whatsapp/notify.ts`.
 *
 * Fronteira única entre os fluxos de negócio e a tabela `Notification`: quem
 * envia um documento ou publica um formulário chama daqui e não monta linha.
 *
 * NENHUMA função deste módulo lança. Enviar um vídeo não pode falhar porque o
 * aviso falhou — o aviso é consequência do ato, não condição dele. O erro vai
 * para o log e a vida segue.
 *
 * As que recebem `tx` rodam DENTRO da transação do fluxo (a notificação de
 * ciclo já era assim): se a transação rolar para trás, o aviso vai junto. As
 * demais são chamadas depois do commit.
 */

type Db = Prisma.TransactionClient | typeof prisma;

async function silently(what: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.error(`[notificacoes] falha ao gravar ${what}:`, e);
  }
}

export interface NewContentInput {
  slug: string;
  kind: "video" | "document";
  title: string;
}

/**
 * Novo material num subsetor PADRAO, para quem está lotado nele.
 *
 * Vitrine não avisa: é catálogo, não treinamento — o progresso já a ignora,
 * e o sino segue a mesma regra. Link e foto também não passam por aqui.
 */
export async function notifyNewContent(input: NewContentInput): Promise<void> {
  await silently("novo material", async () => {
    const sub = await prisma.subsector.findUnique({
      where: { slug: input.slug },
      select: { kind: true, label: true },
    });
    if (!sub || sub.kind !== "PADRAO") return;
    const what = input.kind === "video" ? "Novo vídeo" : "Novo documento";
    await prisma.notification.create({
      data: {
        kind: "CONTEUDO",
        title: `${what} em ${sub.label}`,
        body: input.title,
        href: `/setores/${input.slug}`,
        audience: [input.slug],
      },
    });
  });
}

/**
 * Formulário disponível, para quem foi designado — só as atribuições
 * PENDENTES, o mesmo recorte do WhatsApp (ver `whatsapp/notify.ts`).
 */
export async function notifyFormAvailableInApp(formId: string): Promise<void> {
  await silently("formulário disponível", async () => {
    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: {
        title: true,
        assignments: {
          where: { status: "PENDENTE", user: { active: true } },
          select: { userId: true },
        },
      },
    });
    if (!form || form.assignments.length === 0) return;
    await prisma.notification.createMany({
      data: form.assignments.map((a) => ({
        kind: "FORMULARIO" as const,
        title: "Nova pesquisa disponível",
        body: `Responda "${form.title}" em Minhas Avaliações.`,
        href: "/minhas-avaliacoes",
        audience: [],
        targetUserId: a.userId,
      })),
    });
  });
}

/**
 * Ciclo Pré-Efetivo liberado, para os GESTORES do setor do colaborador —
 * um alvo individual por gestor. É deles a tarefa; o restante do setor não
 * precisa saber que o ciclo de um colega abriu.
 */
export async function notifyCycleAvailableInApp(
  db: Db,
  params: { subjectName: string; sectorId: string | null; cycle: number },
): Promise<void> {
  if (!params.sectorId) return;
  await silently("ciclo disponível", async () => {
    const gestores = await db.user.findMany({
      where: { sectorId: params.sectorId, role: "GESTOR", active: true },
      select: { id: true },
    });
    if (gestores.length === 0) return;
    await db.notification.createMany({
      data: gestores.map((g) => ({
        kind: "AVALIACAO" as const,
        title: `Avaliação Pré-Efetivo disponível — ciclo ${params.cycle}`,
        body: `O ${params.cycle}º ciclo de ${params.subjectName} está liberado para preenchimento.`,
        href: "/setores/rh",
        audience: [],
        targetUserId: g.id,
      })),
    });
  });
}
