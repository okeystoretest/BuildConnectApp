import type { WhatsappKind } from "@prisma/client";

/**
 * Os textos enviados, num lugar só.
 *
 * Ficam aqui, e não espalhados pelos gatilhos, porque são o que o colaborador
 * de fato lê — mudar o endereço do site ou o tom da mensagem não pode exigir
 * caçar strings em três arquivos.
 */

const BASE_URL = "https://buildconnectapp.com.br/minhas-avaliacoes";
const TICKETS_URL = "https://buildconnectapp.com.br/setores/ti";

/** Texto padrão por tipo — usado quando a mensagem não traz texto próprio. */
export const MESSAGE_TEXT: Record<WhatsappKind, string> = {
  AVALIACAO: `Uma nova avaliação já está disponível.\nAcesse ${BASE_URL} para responder.`,
  FORMULARIO: `Uma nova pesquisa já está disponível.\nAcesse ${BASE_URL} para responder.`,
  CHAMADO_TI: `Um novo chamado foi aberto para a Retaguarda.\nAcesse ${TICKETS_URL} para atender.`,
};

/** Chamado de TI: leva o código, que é o que a equipe procura no quadro. */
export function ticketText(code: string): string {
  return `Novo chamado aberto para a Retaguarda: ${code}.\nAcesse ${TICKETS_URL} para atender.`;
}
