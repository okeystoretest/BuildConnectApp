import { prisma } from "@/lib/db/prisma";
import { activeMembersOfSector, activeUserIdsInSubsector } from "@/lib/notifications/membership";
import { newEmployeeManagerText, newEmployeeTeamText, ticketText } from "./messages";
import { enqueue, sendNow, type SendNowOptions } from "./outbox";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Role } from "@/types";

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

export interface NewEmployeeInput {
  /** O recém-cadastrado. Excluído dos destinatários: ninguém se avisa. */
  userId: string;
  fullName: string;
  role: Role;
  sectorId: string | null;
  unitLabel?: string | null;
}

/**
 * Chegou gente nova no setor, para a EQUIPE INTEIRA dele — por dois caminhos.
 *
 * O GESTOR sai por `sendNow`: é ele que planeja o treinamento, e um aviso que
 * chega duas horas depois já perdeu parte da antecedência que era o objetivo.
 * São poucos por setor, então não há rajada.
 *
 * O resto da equipe sai por `enqueue`, com o sorteio de sempre. Um setor de
 * quarenta pessoas disparado de uma vez é exatamente o padrão que faz o
 * WhatsApp bloquear o número — e, para dar as boas-vindas, a hora exata não
 * muda nada.
 *
 * ADMIN não dispara: são contas técnicas ou do próprio DHO, e anunciá-las à
 * equipe é ruído.
 */
export async function notifyNewEmployee(
  input: NewEmployeeInput,
  options: SendNowOptions = {},
): Promise<void> {
  if (input.role === "ADMIN" || !input.sectorId) return;
  await silently("novo integrante", async () => {
    const [sector, equipe] = await Promise.all([
      prisma.sector.findUnique({ where: { id: input.sectorId! }, select: { label: true } }),
      activeMembersOfSector(input.sectorId),
    ]);
    const sectorLabel = sector?.label ?? "";
    const outros = equipe.filter((m) => m.id !== input.userId);
    if (outros.length === 0) return;

    const gestores = outros.filter((m) => m.role === "GESTOR").map((m) => m.id);
    const demais = outros.filter((m) => m.role !== "GESTOR").map((m) => m.id);

    if (gestores.length > 0) {
      await sendNow(
        gestores,
        "INTEGRACAO",
        newEmployeeManagerText({
          fullName: input.fullName,
          roleLabel: ROLE_LABEL[input.role],
          sectorLabel,
          unitLabel: input.unitLabel,
        }),
        options,
      );
    }
    if (demais.length > 0) {
      await enqueue(demais, "INTEGRACAO", {
        text: newEmployeeTeamText({ fullName: input.fullName, sectorLabel }),
      });
    }
  });
}
