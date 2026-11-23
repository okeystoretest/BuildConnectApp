/**
 * O que um relatório novo já traz pronto.
 *
 * Sobrou pouco de propósito. Entregas, Canais e Métricas e OKRs eram listas
 * fixas transcritas da planilha, e foram REMOVIDAS em 23/11/2026: cada semana
 * monta as suas linhas. A planilha congelava a rotina de uma época, e uma
 * linha que não se apaga vira linha que se ignora.
 *
 * O que continua fixo é a PAUTA do one-on-one — ela não é lista de trabalho, é
 * o roteiro da conversa, e um roteiro que muda toda semana não é roteiro.
 *
 * As linhas da pauta são COPIADAS para o relatório na criação, não
 * referenciadas: mudar o roteiro em janeiro não pode reescrever a conversa de
 * dezembro.
 */

import type { MarketingTaskCategory, MarketingTaskPriority } from "@/types/weekly-report";

export interface AgendaTemplate {
  block: string;
  minutes: number;
  question: string;
}

/** Aba 6 — os 40 minutos do one-on-one, em cinco blocos. */
export const AGENDA: readonly AgendaTemplate[] = [
  { block: "Como você está", minutes: 5, question: "Como foi sua semana em carga de trabalho e energia?" },
  { block: "O que funcionou", minutes: 10, question: "O que funcionou melhor nesta semana e por quê?" },
  { block: "O que travou", minutes: 10, question: "O que travou e o que você faria diferente?" },
  { block: "O que precisa de mim", minutes: 10, question: "O que depende de mim para você avançar?" },
  { block: "Combinados", minutes: 5, question: "Quais são os 2 ou 3 combinados para a próxima semana?" },
];

export interface TaskTemplate {
  title: string;
  category: MarketingTaskCategory;
  priority: MarketingTaskPriority;
}

/**
 * Aba 7 — os 12 cartões com que o quadro abre.
 *
 * Só são criados pelo `setup`, uma vez, e nunca mais: o Kanban é permanente, e
 * recriá-los a cada semana duplicaria o quadro. Diferente das seções do
 * relatório, aqui a semeadura é de UMA vez — não uma predefinição que volta.
 */
export const TASKS: readonly TaskTemplate[] = [
  { title: "Revisar calendário editorial da semana", category: "CONTEUDO", priority: "ALTA" },
  { title: "Organizar cronograma de conteúdo das vendedoras", category: "CONTEUDO", priority: "ALTA" },
  { title: "Separar referências e roteiros para gravação de terça e quinta", category: "CONTEUDO", priority: "ALTA" },
  { title: "Organizar conteúdo da coleção vigente na vitrine e no Drive", category: "CONTEUDO", priority: "MEDIA" },
  { title: "Gravar conteúdos individuais com consultoras", category: "CONTEUDO", priority: "ALTA" },
  { title: "Acompanhar edição dos vídeos gravados", category: "CONTEUDO", priority: "MEDIA" },
  { title: "Revisar legendas, artes e conteúdos programados", category: "PUBLICACAO", priority: "ALTA" },
  { title: "Agendar posts em Instagram, TikTok, Facebook, Pinterest e LinkedIn", category: "PUBLICACAO", priority: "ALTA" },
  { title: "Responder DMs e comentários em até 24h", category: "COMUNIDADE", priority: "ALTA" },
  { title: "Coletar UGC e repostar clientes", category: "COMUNIDADE", priority: "MEDIA" },
  { title: "Preencher relatório semanal e enviar até 18h", category: "RELATORIO", priority: "ALTA" },
  { title: "Documentar 1 processo novo no manual do squad", category: "PROCESSO", priority: "BAIXA" },
];
