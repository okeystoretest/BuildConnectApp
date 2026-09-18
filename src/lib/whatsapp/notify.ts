import { prisma } from "@/lib/db/prisma";
import { activeUserIdsInSubsector } from "@/lib/notifications/membership";
import { ticketText } from "./messages";
import { enqueue, sendNow, type SendNowOptions } from "./outbox";

/**
 * Os gatilhos das notificações por WhatsApp.
 *
 * Fronteira única entre as regras de negócio e a fila: os fluxos de avaliação
 * e de formulário chamam daqui e não conhecem `outbox`, `jid` nem Baileys.
 *
 * NENHUMA função deste módulo lança. Publicar um formulário ou designar uma
 * avaliação não pode falhar porque a notificação falhou — a mensagem é
 * consequência do ato, não condição dele. O erro vai para o log e a vida
 * segue.
 *
 * Todas devem ser chamadas DEPOIS que a transação do fluxo commitou. Enfileirar
 * dentro dela usaria outra conexão, fora do escopo da transação: se ela
 * rolasse para trás, a mensagem sairia assim mesmo, avisando sobre algo que
 * não aconteceu.
 */

async function silently(what: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.error(`[whatsapp] falha ao enfileirar ${what}:`, e);
  }
}

/**
 * Avaliação pendente, para quem tem de respondê-la.
 *
 * Recebe os ids já resolvidos porque quem chama sabe quem designou — não há o
 * que descobrir aqui.
 */
export async function notifyPendingEvaluation(userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return;
  await silently("avaliação pendente", () => enqueue(userIds, "AVALIACAO"));
}

/**
 * Ciclo Pré-Efetivo liberado, para os GESTORES do setor.
 *
 * A notificação de tela usa audiência de setor; aqui o destinatário precisa ser
 * uma pessoa. Quem tem a tarefa pendente é o gestor — é ele que avalia. Mandar
 * para o setor inteiro seria avisar dezenas de pessoas sobre trabalho que não
 * é delas, que é como uma notificação útil vira ruído ignorado.
 */
export async function notifyCycleAvailable(sectorId: string | null): Promise<void> {
  if (!sectorId) return;
  await silently("ciclo disponível", async () => {
    const gestores = await prisma.user.findMany({
      where: { sectorId, role: "GESTOR", active: true },
      select: { id: true },
    });
    return enqueue(
      gestores.map((g) => g.id),
      "AVALIACAO",
    );
  });
}

/**
 * Formulário disponível, para quem foi designado a respondê-lo.
 *
 * Os destinatários saem das próprias atribuições — que é a definição de
 * "elegível ao formulário", já resolvida na publicação com o recorte por setor
 * aplicado no servidor. Não há regra nova para inventar aqui.
 *
 * Só as PENDENTES: ao reabrir, todas voltam a pendente e todo mundo é avisado
 * de novo, que é o comportamento certo para uma rodada nova.
 */
export async function notifyFormAvailable(formId: string): Promise<void> {
  await silently("formulário disponível", async () => {
    const destinatarios = await prisma.formAssignment.findMany({
      where: { formId, status: "PENDENTE", user: { active: true } },
      select: { userId: true },
    });
    return enqueue(
      destinatarios.map((d) => d.userId),
      "FORMULARIO",
    );
  });
}

/** Slug do subsetor da Retaguarda — a chave da rota /setores/ti e do RBAC. */
export const TI_SLUG = "ti";

/**
 * Chamado de TI aberto, para TODOS os usuários ativos lotados na Retaguarda.
 *
 * Fora da fila, de propósito: é o único tipo em que o atraso anula o aviso.
 * Quem chama deve fazê-lo com `void`, depois do commit — a Server Action do
 * chamado não espera o WhatsApp.
 */
export async function notifyNewItTicket(
  code: string,
  options: SendNowOptions & { slug?: string } = {},
): Promise<void> {
  await silently("chamado de TI", async () => {
    const ids = await activeUserIdsInSubsector(options.slug ?? TI_SLUG);
    return sendNow(ids, "CHAMADO_TI", ticketText(code), options);
  });
}
