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
  INTEGRACAO: "Um novo integrante foi cadastrado no seu setor.",
};

/** Chamado de TI: leva o código, que é o que a equipe procura no quadro. */
export function ticketText(code: string): string {
  return `Novo chamado aberto para a Retaguarda: ${code}.\nAcesse ${TICKETS_URL} para atender.`;
}

/**
 * Integração, na versão do GESTOR: leva cargo e unidade, que é o que ele
 * precisa para planejar o treinamento — e é por isso que esta sai na hora,
 * enquanto a da equipe espera a fila.
 */
export function newEmployeeManagerText(params: {
  fullName: string;
  roleLabel: string;
  sectorLabel: string;
  unitLabel?: string | null;
}): string {
  const unidade = params.unitLabel ? `, unidade ${params.unitLabel}` : "";
  return (
    `Novo integrante no seu setor: ${params.fullName} (${params.roleLabel})${unidade}.` +
    `\nPlaneje a integração e o treinamento com antecedência.`
  );
}

/**
 * Integração, na versão da EQUIPE: quem chegou e onde, sem a tarefa.
 *
 * Não repete cargo nem unidade de propósito — para o colega, o que importa é
 * que há gente nova. Nenhum texto daqui leva telefone, usuário ou senha.
 */
export function newEmployeeTeamText(params: { fullName: string; sectorLabel: string }): string {
  return `${params.fullName} entrou no setor ${params.sectorLabel}.\nDê as boas-vindas ao novo integrante da equipe.`;
}
