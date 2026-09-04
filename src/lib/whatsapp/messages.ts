import type { WhatsappKind } from "@prisma/client";

/**
 * Os textos enviados, num lugar só.
 *
 * Ficam aqui, e não espalhados pelos gatilhos, porque são o que o colaborador
 * de fato lê — mudar o endereço do site ou o tom da mensagem não pode exigir
 * caçar strings em três arquivos.
 */

const BASE_URL = "https://buildconnectapp.com.br/minhas-avaliacoes";

export const MESSAGE_TEXT: Record<WhatsappKind, string> = {
  AVALIACAO: `Uma nova avaliação já está disponível.\nAcesse ${BASE_URL} para responder.`,
  FORMULARIO: `Uma nova pesquisa já está disponível.\nAcesse ${BASE_URL} para responder.`,
};
