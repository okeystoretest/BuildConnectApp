/**
 * Os modelos fixos do Relatório Semanal, transcritos da planilha
 * "Relatorio-Semanal-Karen-Okey.xlsx".
 *
 * É daqui que um relatório novo nasce preenchido. As linhas são COPIADAS para
 * o relatório na criação (ver `actions.criarRelatorio`), e não referenciadas:
 * reescrever a rotina em janeiro não pode mudar o que foi cobrado em
 * dezembro. Mexer neste arquivo afeta só as semanas criadas DEPOIS.
 *
 * Fonte: abas 2 (Entregas da Semana), 3 (Canais e Métricas), 4 (OKRs
 * Semanais e do Trimestre), 6 (Pauta do One-on-One) e 7 (Kanban) do arquivo
 * entregue pelo Marketing em 17/11/2026.
 */

import type { MarketingTaskCategory, MarketingTaskPriority } from "@/types/weekly-report";

export interface DeliveryTemplate {
  day: string;
  block: string;
  expected: string;
}

/** Aba 2 — a rotina da semana, dia a dia. 22 linhas, na ordem da planilha. */
export const DELIVERIES: readonly DeliveryTemplate[] = [
  { day: "Segunda", block: "Planejamento e calendário", expected: "Calendário editorial da semana fechado e aprovado" },
  { day: "Segunda", block: "Organização de conteúdo", expected: "Cronograma de conteúdo das vendedoras organizado" },
  { day: "Segunda", block: "Preparação de gravação", expected: "Referências, ideias e roteiros separados para terça e quinta" },
  { day: "Segunda", block: "Alinhamento", expected: "Demandas alinhadas com a equipe" },
  { day: "Segunda", block: "Vitrine e Drive", expected: "Conteúdo da coleção vigente organizado na vitrine e no Drive" },
  { day: "Terça", block: "Reunião comercial", expected: "Reunião geral de comercial realizada" },
  { day: "Terça", block: "One-on-one com Carlos", expected: "Reunião pessoal realizada" },
  { day: "Terça", block: "Gravação", expected: "Conteúdos individuais gravados com consultoras (falas, posicionamento, abordagem de venda)" },
  { day: "Quarta", block: "Edição", expected: "Edição dos vídeos acompanhada" },
  { day: "Quarta", block: "Revisão", expected: "Legendas, artes e conteúdos programados revisados" },
  { day: "Quarta", block: "Processos", expected: "Processos que precisam de melhoria organizados" },
  { day: "Quarta", block: "Desempenho", expected: "Desempenho dos conteúdos publicados acompanhado" },
  { day: "Quarta", block: "Ideias", expected: "Ideias para próximos conteúdos desenvolvidas" },
  { day: "Quarta", block: "Roteiros", expected: "Roteiros de quinta-feira preparados" },
  { day: "Quinta", block: "Gravação", expected: "Conteúdos de atacado gravados (argumentos comerciais, novidades, diferenciais)" },
  { day: "Sexta", block: "Conferência", expected: "Demandas da semana conferidas" },
  { day: "Sexta", block: "Calendário", expected: "Calendário de publicações acompanhado" },
  { day: "Sexta", block: "Análise", expected: "Resultados dos conteúdos analisados e melhores vídeos identificados" },
  { day: "Sexta", block: "Pendências", expected: "Pendências da próxima semana organizadas" },
  { day: "Sexta", block: "Planejamento", expected: "Ideias de planejamento futuro e peças solicitadas para gravação" },
  { day: "Sexta", block: "Relatório", expected: "Relatório semanal preenchido e enviado" },
];

export interface MetricTemplate {
  channel: string;
  metric: string;
  /** Texto da coluna "Meta/Benchmark". Ausente onde a planilha trazia "—". */
  target?: string;
}

/** Aba 3 — os 20 números dos canais. */
export const METRICS: readonly MetricTemplate[] = [
  { channel: "Instagram @okeystorebr", metric: "Alcance (contas)", target: "149.500/mês" },
  { channel: "Instagram @okeystorebr", metric: "Taxa de engajamento (%)", target: "2,5% (benchmark)" },
  { channel: "Instagram @okeystorebr", metric: "Salvamentos por post", target: "13,8 (média atual)" },
  { channel: "Instagram @okeystorebr", metric: "Posts sem comentários (%)", target: "Reduzir de 48%" },
  { channel: "Instagram @okeystorebr", metric: "Seguidores", target: "+3.000 no trimestre" },
  { channel: "Instagram @okeystorebr", metric: "Posts publicados", target: "5/semana" },
  { channel: "TikTok", metric: "Vídeos publicados", target: "3/semana" },
  { channel: "TikTok", metric: "Visualizações" },
  { channel: "YouTube", metric: "Vídeos longos publicados", target: "1/semana" },
  { channel: "YouTube", metric: "Shorts publicados", target: "3/semana" },
  { channel: "Pinterest", metric: "Pins publicados", target: "5/semana" },
  { channel: "WhatsApp Business", metric: "Listas segmentadas (varejo/atacado)", target: "2 listas ativas" },
  { channel: "WhatsApp Business", metric: "Ofertas enviadas" },
  { channel: "E-commerce Okey", metric: "Sessões" },
  { channel: "E-commerce Okey", metric: "Taxa de conversão (%)" },
  { channel: "E-commerce Okey", metric: "Ticket médio (R$)" },
  { channel: "Atacado", metric: "Pedidos de lojistas" },
  { channel: "Atacado", metric: "Novos lojistas cadastrados" },
  { channel: "Google/busca orgânica", metric: "Cliques orgânicos" },
  { channel: "Influenciadoras/criadores", metric: "Parcerias ativas" },
];

export interface OkrTemplate {
  objective: string;
  keyResult: string;
  measure: string;
  /** Meta do trimestre, como ela se lê na aba "OKRs do Trimestre". */
  goalLabel: string;
  /**
   * A mesma meta em número, quando ela tem um. Ausente em "0 falhas" e em
   * "+20% vs trimestre anterior": dividir o realizado por elas não produz
   * percentual nenhum, e a planilha devolvia "—" exatamente nesses casos.
   */
  goalValue?: number;
  /** Linhas amarelas da planilha: leitura MENSAL, média de 4 semanas. */
  monthlyRead?: boolean;
}

/** Aba 4 — os 9 resultados-chave, com a meta do trimestre. */
export const OKRS: readonly OkrTemplate[] = [
  {
    objective: "Consistência de publicação",
    keyResult: "Publicar 100% do calendário aprovado",
    measure: "Posts publicados ÷ planejados",
    goalLabel: "100%",
    goalValue: 100,
  },
  {
    objective: "Consistência de publicação",
    keyResult: "Zero atraso de agendamento",
    measure: "Checklist de agendamento",
    goalLabel: "0 falhas",
  },
  {
    objective: "Consistência de publicação",
    keyResult: "Manter 5 posts/semana no Instagram",
    measure: "Contagem no feed",
    goalLabel: "20/mês",
    goalValue: 20,
  },
  {
    objective: "Crescimento e engajamento",
    keyResult: "Elevar taxa de engajamento do Instagram",
    measure: "Curtidas + comentários + salvos ÷ alcance",
    goalLabel: "+20% vs trimestre anterior",
    monthlyRead: true,
  },
  {
    objective: "Crescimento e engajamento",
    keyResult: "Crescer base de seguidores",
    measure: "Insights do perfil",
    goalLabel: "+3.000 seguidores",
    goalValue: 3000,
    monthlyRead: true,
  },
  {
    objective: "Crescimento e engajamento",
    keyResult: "Responder DMs em até 24h",
    measure: "Tempo médio de resposta",
    goalLabel: "95%",
    goalValue: 95,
  },
  {
    objective: "Organização e processo",
    keyResult: "Manter quadro Kanban 100% atualizado",
    measure: "Auditoria do board na sexta",
    goalLabel: "100%",
    goalValue: 100,
  },
  {
    objective: "Organização e processo",
    keyResult: "Entregar relatório semanal até sexta 18h",
    measure: "Registro de entrega",
    goalLabel: "12 de 12 semanas",
    goalValue: 12,
  },
  {
    objective: "Organização e processo",
    keyResult: "Documentar 1 processo novo por mês",
    measure: "Pasta de processos",
    goalLabel: "3 no trimestre",
    goalValue: 3,
  },
];

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
 * Só são criados no `setup`, uma vez, e nunca mais: o Kanban é permanente, e
 * recriá-los a cada semana duplicaria o quadro.
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

/**
 * Aba 1 (Instruções) — o texto que abria a planilha.
 *
 * Vive aqui, e não no componente, porque é CONTEÚDO da ferramenta: quem for
 * corrigir a regra de ouro procura o texto, não o JSX.
 */
export const INSTRUCTIONS: readonly { title: string; body: string }[] = [
  {
    title: "Para que serve",
    body: "Registrar o que foi entregue na semana, os números dos canais e o que precisa de decisão do gestor. É a base da conversa de sexta.",
  },
  {
    title: "Quando preencher",
    body: "Durante a sexta-feira, no bloco das 10h30 às 12h (análise de resultados), e enviar até as 18h.",
  },
  {
    title: "Regra de ouro",
    body: "Todo número vem acompanhado de “o porquê” e “o próximo passo”. Número sem leitura não fecha a semana.",
  },
  {
    title: "Ordem de preenchimento",
    body: "Resumo → Entregas → Canais e Métricas → OKRs → Bloqueios e Decisões → Pauta do One-on-One.",
  },
  {
    title: "Kanban",
    body: "Mover os cartões da esquerda para a direita conforme a tarefa avança. Toda tarefa precisa de evidência antes de ir para Publicado. O quadro é auditado toda sexta.",
  },
  {
    title: "OKRs de crescimento",
    body: "Os KRs marcados como leitura MENSAL são decididos sobre a média de 4 semanas, nunca sobre uma semana isolada.",
  },
];
