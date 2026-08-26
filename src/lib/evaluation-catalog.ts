// Espelha o enum EvaluationKind do schema. Local para não acoplar o seed ao
// client gerado (evita erro quando o client ainda não foi gerado no build).
export type EvaluationKind =
  | "PRE_EFETIVO"
  | "COMPORTAMENTAL"
  | "MATRIZ_DECISAO"
  | "EFICACIA"
  | "INTELIGENCIA_EMOCIONAL";

/**
 * Catálogo dos instrumentos de avaliação. Fonte da verdade para o seed.
 *
 * Cada instrumento tem um `kind`, escala e — quando `hasCycle` — o ciclo de
 * 3 etapas (Pré-Efetivo). O formulário é dividido em seções (páginas) e
 * perguntas. Para o Pré-Efetivo, o formulário F04 tem 16 critérios numa
 * única lista; dividimos em duas páginas de 8 para reduzir a fadiga de
 * rolagem exigida no requisito de UX.
 */

export interface SeedQuestion {
  label: string;
  helpText?: string;
}

export interface SeedSection {
  title: string;
  questions: SeedQuestion[];
}

export interface SeedEvaluationType {
  slug: string;
  kind: EvaluationKind;
  title: string;
  description?: string;
  scaleMax: number;
  /** Rótulos da escala (índice 0 = valor 1). Vazio = numérica. */
  scaleLabels?: string[];
  hasCycle: boolean;
  order: number;
  sections: SeedSection[];
}

// F04 — Acompanhamento Funcional Pré-Efetivo. 16 critérios, escala 1–5.
const PRE_EFETIVO_CRITERIA: SeedQuestion[] = [
  { label: "Disciplina", helpText: "Obediência às normas da empresa e ordens recebidas." },
  { label: "Iniciativa", helpText: "Fazer o que tem de ser feito sem esperar ordens." },
  { label: "Assiduidade", helpText: "Não faltar ao trabalho." },
  { label: "Pontualidade", helpText: "Não chegar atrasado e cumprir o horário da empresa." },
  { label: "Apresentação pessoal", helpText: "Asseio pessoal, roupa e organização do local de trabalho." },
  { label: "Sociabilidade", helpText: "Facilidade para trabalhar em grupo." },
  { label: "Cooperação", helpText: "Contribuição com os outros visando objetivos comuns." },
  { label: "Dinamismo", helpText: "Capacidade de agilizar o processo produtivo." },
  { label: "Liderança", helpText: "Capacidade de conduzir os outros a objetivos comuns." },
  { label: "Responsabilidade", helpText: "Comprometer-se a realizar tudo aquilo que é de sua atribuição." },
  { label: "Eficiência", helpText: "Realização de atribuições dentro dos prazos e critérios estabelecidos." },
  { label: "Eficácia / Produtividade", helpText: "Qualidade do trabalho apresentado dentro dos critérios de qualidade." },
  { label: "Potencialidade", helpText: "Aptidão para exercício de outras atribuições ou funções." },
  { label: "Criatividade", helpText: "Capacidade de encontrar soluções diferentes para os mesmos acontecimentos." },
  { label: "Simpatia", helpText: "Habilidade de expressar alegria e felicidade." },
  { label: "Foco no resultado", helpText: "Capacidade de olhar para os processos como um todo, focando não na tarefa, mas no resultado." },
];

// Avaliação Multidirecional de Eficácia no Trabalho — 20 competências (ET1–ET20),
// escala 1–5. Cada competência tem 2 afirmações (A e B); o helpText resume ambas
// para orientar quem responde. A média por competência é consolidada pelo RH.
const EFICACIA_CRITERIA: SeedQuestion[] = [
  { label: "ET1 — Concentrar-se nos resultados", helpText: "Compromisso com as metas da organização; atinge os resultados desejados." },
  { label: "ET2 — Manter a qualidade", helpText: "Atenção a detalhes; trabalha consistentemente num alto nível." },
  { label: "ET3 — Tomar iniciativa", helpText: "Resolve problemas rapidamente; toma decisões apropriadas quando necessário." },
  { label: "ET4 — Buscar melhorias", helpText: "Contribui com ideias de melhoria; é receptivo às ideias dos outros." },
  { label: "ET5 — Organizar-se bem", helpText: "Administra grandes prioridades; tem práticas e sistemas eficientes." },
  { label: "ET6 — Comunicar informações", helpText: "Transmite informações relevantes; destaca os pontos principais ao comunicar." },
  { label: "ET7 — Cumprir as promessas", helpText: "Acompanha os compromissos; informa quando não poderá cumprir uma promessa." },
  { label: "ET8 — Ser franco e sincero", helpText: "Expressa opiniões à vontade; hábil ao dar e receber feedback." },
  { label: "ET9 — Resolver conflitos produtivamente", helpText: "Lida com conflitos de forma colaborativa; ajuda a mediar entre pessoas." },
  { label: "ET10 — Voltar-se sempre para o cliente", helpText: "Disposição para ajudar clientes internos e externos; excede expectativas." },
  { label: "ET11 — Ser positivo diante das mudanças", helpText: "Receptivo a mudanças que melhorem o desempenho; trabalha pela implementação." },
  { label: "ET12 — Aprender rapidamente", helpText: "Proativo em buscar oportunidades de aprender; adapta-se a novos sistemas." },
  { label: "ET13 — Conviver bem com a tecnologia", helpText: "Compreende as tecnologias atuais e futuras; usa a tecnologia de forma eficaz." },
  { label: "ET14 — Administrar a própria carreira", helpText: "Assume o próprio desenvolvimento; tem planos realistas para suas metas." },
  { label: "ET15 — Pensar à frente", helpText: "Antevê problemas; busca oportunidades de crescimento pessoal e profissional." },
  { label: "ET16 — Tolerar bem a incerteza", helpText: "Sente-se à vontade com futuro incerto; mantém eficácia sem informações completas." },
  { label: "ET17 — Fazer mais com menos", helpText: "Lida bem com recursos limitados; ajusta-se ao aumento na carga de trabalho." },
  { label: "ET18 — Ser muito flexível", helpText: "Assume outras funções quando necessário; muda de ponto de vista diante de dados." },
  { label: "ET19 — Ter estabilidade emocional", helpText: "Não se abala facilmente; lida com altos níveis de estresse." },
  { label: "ET20 — Buscar inovação", helpText: "Experimenta novas maneiras de fazer as coisas; tem ideias novas sob pressão." },
];

// ─────────────────────────────────────────────────────────────
// Matriz de Decisão — escala 1–10, dois blocos
// ─────────────────────────────────────────────────────────────
//
// A ORDEM das duas seções é significativa e NÃO pode ser trocada:
//   seção 0 = Critérios Técnicos   → eixo X do gráfico
//   seção 1 = Critérios Emocionais → eixo Y do gráfico
// `src/lib/matriz-decisao.ts` lê os eixos por essa ordem.

const MATRIZ_TECNICOS: SeedQuestion[] = [
  { label: "O colaborador demonstra comprometimento com os objetivos e metas organizacionais?" },
  { label: "O colaborador alcança de maneira consistente os resultados esperados?" },
  { label: "Executa suas tarefas com atenção e precisão" },
  { label: "Mantém alto padrão de desempenho em sua função" },
  { label: "Toma decisões assertivas quando necessário" },
  { label: "Contribui com ideias para a melhoria de seus processos" },
  { label: "Demonstra receptividade a feedbacks para seu aprimoramento" },
  { label: "Define prioridades de maneira adequada e tempestiva" },
  { label: "Utiliza métodos eficientes na organização do trabalho individual" },
  { label: "Transmite informações relevantes de forma clara e eficiente" },
  { label: "Cumpre rigorosamente os prazos e compromissos assumidos" },
  { label: "Informa previamente a impossibilidade de cumprir prazos" },
  { label: "Demonstra habilidade ao oferecer e receber feedbacks de desempenho" },
  { label: "Busca exceder as expectativas dos clientes sempre que possível" },
  { label: "Adota postura proativa diante de oportunidades de aprendizado" },
  { label: "Domina as tecnologias atuais e inovações de sua área" },
  { label: "Assume a responsabilidade pelo seu próprio desenvolvimento profissional" },
];

const MATRIZ_EMOCIONAIS: SeedQuestion[] = [
  { label: "Autoconfiança", helpText: "Demonstra segurança quanto ao próprio valor, capacidades e potencial." },
  { label: "Autocontrole emocional", helpText: "Mantém o domínio de suas emoções e impulsos em momentos críticos." },
  { label: "Superação", helpText: "Busca continuamente elevar o nível de excelência no próprio desempenho." },
  { label: "Iniciativa", helpText: "Age de forma proativa na identificação e no aproveitamento de oportunidades." },
  { label: "Transparência e Credibilidade", helpText: "Atua com integridade e honestidade, transmitindo confiança." },
  { label: "Flexibilidade", helpText: "Adapta-se com facilidade a diferentes pessoas, cenários dinâmicos e visões divergentes." },
  { label: "Otimismo", helpText: "Mantém uma atitude construtiva e positiva perante os desafios." },
  { label: "Empatia", helpText: "Compreende as emoções e perspectivas alheias, demonstrando interesse legítimo pelos outros." },
  { label: "Orientação a Serviços", helpText: "Identifica e atende às necessidades de clientes e liderados, apoiando seu desenvolvimento." },
  { label: "Liderança Inspiradora", helpText: "Engaja e motiva a equipe em direção a metas comuns e de alto impacto." },
  { label: "Influência", helpText: "Possui capacidade de persuadir, alinhar visões e mobilizar pessoas." },
  { label: "Gerenciamento de Conflitos", helpText: "Medeia e soluciona divergências, promovendo o entendimento mútuo." },
  { label: "Trabalho em Equipe", helpText: "Fomenta a colaboração e o espírito de equipe focado em altos resultados." },
];

export const EVALUATION_CATALOG: SeedEvaluationType[] = [
  {
    slug: "acompanhamento-pre-efetivo",
    kind: "PRE_EFETIVO",
    title: "Acompanhamento Funcional Pré-Efetivo",
    description:
      "Avaliação de conformidade do colaborador em 3 ciclos (7, 14 e 21 dias úteis após o cadastro).",
    scaleMax: 5,
    hasCycle: true,
    order: 0,
    sections: [
      { title: "Critérios 1 a 8", questions: PRE_EFETIVO_CRITERIA.slice(0, 8) },
      { title: "Critérios 9 a 16", questions: PRE_EFETIVO_CRITERIA.slice(8, 16) },
    ],
  },
  // Os demais instrumentos entram nas próximas entregas (avulsos, hasCycle=false).
  {
    slug: "desempenho-comportamental",
    kind: "COMPORTAMENTAL",
    title: "Análise de Desempenho Comportamental",
    description:
      "Avaliação comportamental em escala qualitativa (Excelente, Satisfatório, Regular, Insatisfatório).",
    scaleMax: 4,
    // Índice 0 = valor 1 (pior) … índice 3 = valor 4 (melhor).
    scaleLabels: ["Insatisfatório", "Regular", "Satisfatório", "Excelente"],
    hasCycle: false,
    order: 1,
    sections: [
      { title: "Critérios 1 a 8", questions: PRE_EFETIVO_CRITERIA.slice(0, 8) },
      { title: "Critérios 9 a 16", questions: PRE_EFETIVO_CRITERIA.slice(8, 16) },
    ],
  },
  {
    slug: "matriz-de-decisao",
    kind: "MATRIZ_DECISAO",
    title: "Matriz de Decisão",
    description:
      "Avaliação com múltiplos avaliadores designados pelo DHO + autoavaliação do colaborador. Escala 1–10 em dois blocos: competências técnicas (eixo X) e competências emocionais (eixo Y). O cruzamento das duas médias posiciona o colaborador no gráfico da matriz.",
    scaleMax: 10,
    hasCycle: false,
    order: 2,
    sections: [
      { title: "Critérios Técnicos — Habilidade e Conhecimento", questions: MATRIZ_TECNICOS },
      { title: "Critérios Emocionais — Atitude e Caráter", questions: MATRIZ_EMOCIONAIS },
    ],
  },
  {
    slug: "eficacia-no-trabalho",
    kind: "EFICACIA",
    title: "Avaliação Multidirecional de Eficácia no Trabalho",
    description:
      "Avaliação 360°: N avaliadores designados + autoavaliação do colaborador, em 20 competências (ET1–ET20), escala 1–5. O DHO vê a consolidação por competência, com o nome de cada avaliador.",
    scaleMax: 5,
    hasCycle: false,
    order: 3,
    sections: [
      { title: "Competências ET1 a ET10", questions: EFICACIA_CRITERIA.slice(0, 10) },
      { title: "Competências ET11 a ET20", questions: EFICACIA_CRITERIA.slice(10, 20) },
    ],
  },
  { slug: "inteligencia-emocional", kind: "INTELIGENCIA_EMOCIONAL", title: "Avaliação Multidirecional de Inteligência Emocional", scaleMax: 5, hasCycle: false, order: 4, sections: [] },
];
