export type EvaluationKind =
  | "PRE_EFETIVO"
  | "COMPORTAMENTAL"
  | "MATRIZ_DECISAO"
  | "EFICACIA"
  | "INTELIGENCIA_EMOCIONAL";

export type CycleStatus = "AGENDADO" | "DISPONIVEL" | "CONCLUIDO";

/** Pergunta/critério do formulário. */
export interface EvalQuestion {
  id: string;
  label: string;
  helpText?: string;
}

/** Seção paginada (uma página do formulário). */
export interface EvalSection {
  id: string;
  title: string;
  questions: EvalQuestion[];
}

/** Definição completa de um instrumento, para renderizar o formulário. */
export interface EvalForm {
  id: string;
  slug: string;
  kind: EvaluationKind;
  title: string;
  description?: string;
  scaleMax: number;
  /** Rótulos da escala (índice 0 = valor 1). Vazio = escala numérica. */
  scaleLabels: string[];
  hasCycle: boolean;
  sections: EvalSection[];
}

/** Card de instrumento na aba Avaliações (contagem de submissões). */
export interface EvaluationTypeCard {
  id: string;
  slug: string;
  kind: EvaluationKind;
  title: string;
  hasCycle: boolean;
  count: number;
}

/** Um ciclo do Pré-Efetivo para um colaborador. */
export interface CycleInfo {
  cycle: number;
  status: CycleStatus;
  availableAt: string; // ISO
  completedAt?: string; // ISO
}

/** Item da fila de "avaliações a preencher" (ciclos disponíveis). */
export interface PendingEvaluation {
  subjectId: string;
  subjectName: string;
  sector: string;
  typeId: string;
  typeSlug: string;
  typeTitle: string;
  cycle: number;
  availableAtLabel: string;
}

/** Colaborador com sua agenda de ciclos, para a visão do Pré-Efetivo. */
export interface SubjectCycles {
  subjectId: string;
  subjectName: string;
  sector: string;
  admittedAtLabel: string;
  cycles: CycleInfo[];
}

/** Resposta calculada exibida no resumo de pré-envio. */
export interface EvaluationDraftSummary {
  typeTitle: string;
  subjectName: string;
  cycle?: number;
  total: number;
  maxTotal: number;
  answered: number;
  totalQuestions: number;
}

// ─────────────────────────────────────────────────────────────
// Resultados de Avaliação — fluxo em 3 níveis (cards → avaliado → resultado)
// ─────────────────────────────────────────────────────────────

/** Uma resposta já resolvida para exibição (valor + rótulo da escala). */
export interface EvaluationResultAnswer {
  label: string;
  helpText?: string;
  value: number;
  /** Rótulo da escala quando qualitativa; senão o próprio número. */
  valueLabel: string;
}

/** Seção do instrumento com suas respostas e o subtotal calculado. */
export interface EvaluationResultSection {
  title: string;
  answers: EvaluationResultAnswer[];
  total: number;
  maxTotal: number;
}

/** Resultado completo de UMA submissão (tela cheia da aba de Resultados). */
export interface EvaluationResultDetail {
  id: string;
  typeTitle: string;
  typeSlug: string;
  kind: EvaluationKind;
  subjectName: string;
  subjectSector: string;
  evaluatorName?: string;
  cycle?: number;
  total: number;
  maxTotal: number;
  scaleMax: number;
  /** Rótulos da escala, para exibir E/S/R/I no lugar de números. */
  scaleLabels: string[];
  observations?: string;
  /** Data em que a avaliação foi finalizada (dd/mm/aaaa). */
  finishedAtLabel: string;
  /** Horário em que a avaliação foi finalizada (HH:mm). */
  finishedAtTimeLabel: string;
  sections: EvaluationResultSection[];
}

/** Submissão avulsa (um avaliador, uma nota final). */
export interface EvaluationSingleEntry {
  mode: "SIMPLES";
  id: string;
  cycle?: number;
  total: number;
  maxTotal: number;
  evaluatorName?: string;
  finishedAtLabel: string;
  finishedAtTimeLabel: string;
}

/** Rodada multidirecional (N avaliadores + autoavaliação). */
export interface EvaluationRoundEntry {
  mode: "MULTI";
  id: string;
  status: EfficacyRoundStatus;
  /** Avaliadores de feedback designados (não conta a autoavaliação). */
  raterQuota: number;
  feedbackDone: number;
  selfDone: boolean;
  startedAtLabel: string;
  /** Preenchidos só quando a rodada fecha. */
  finishedAtLabel?: string;
  finishedAtTimeLabel?: string;
}

export type EvaluationResultEntry = EvaluationSingleEntry | EvaluationRoundEntry;

/** Nível 2: um avaliado com todos os seus registros daquele instrumento. */
export interface EvaluationResultSubject {
  subjectId: string;
  subjectName: string;
  sector: string;
  entries: EvaluationResultEntry[];
  /** Data/hora do registro mais recente ("dd/mm/aaaa às HH:mm"). */
  lastLabel: string;
}

/** Nível 1: card de instrumento no seletor de resultados. */
export interface EvaluationResultTypeCard {
  typeId: string;
  slug: string;
  kind: EvaluationKind;
  title: string;
  /** Instrumento com múltiplos avaliadores (rodada + autoavaliação). */
  multiRater: boolean;
  /** Total de registros (submissões avulsas + rodadas). */
  count: number;
  subjects: EvaluationResultSubject[];
}

/**
 * Abrangência do `roster` que veio do servidor.
 *  - GLOBAL: Admin — todos os colaboradores ativos da empresa.
 *  - SETOR: Gestor — só os colaboradores do setor da página.
 * A UI usa isto para escrever o estado vazio corretamente.
 */
export type EvaluationScope = "GLOBAL" | "SETOR";

/** Payload da aba "Avaliações" de um setor (preenchimento no próprio setor). */
export interface SectorEvaluations {
  sectorLabel: string;
  scope: EvaluationScope;
  pending: PendingEvaluation[];
  subjects: SubjectCycles[];
  preEfetivoForm: EvalForm | null;
  /** Todas as 5 avaliações (cards para o seletor). */
  types: EvaluationTypeCard[];
  /** Colaboradores do setor, selecionáveis como avaliado. */
  roster: EvaluationSubject[];
  /** Formulários das avaliações avulsas, por slug (Pré-Efetivo vem à parte). */
  forms: Record<string, EvalForm>;
}

/** Colaborador que pode ser escolhido como avaliado. */
export interface EvaluationSubject {
  id: string;
  name: string;
  sector: string;
}

// ─────────────────────────────────────────────────────────────
// Avaliação multidirecional (Eficácia no Trabalho)
// ─────────────────────────────────────────────────────────────

export type EfficacyRoundStatus = "COLETANDO_FEEDBACK" | "AGUARDANDO_AUTO" | "CONCLUIDA";

/** Um avaliador designado numa rodada (nome + se já enviou). Visão do RH. */
export interface EfficacyRaterState {
  name: string;
  done: boolean;
}

/** Linha da lista de rodadas (card "Atribuir Avaliações"). */
export interface EfficacyRoundRow {
  id: string;
  typeSlug: string;
  typeTitle: string;
  subjectId: string;
  subjectName: string;
  sector: string;
  /** Avaliadores de feedback. O total exibido é `raterQuota + 1` (autoavaliação). */
  raterQuota: number;
  feedbackDone: number;
  status: EfficacyRoundStatus;
  selfDone: boolean;
  createdAtLabel: string;
  createdAtTimeLabel: string;
  raters: EfficacyRaterState[];
}

/** Instrumento que aceita atribuição de múltiplos avaliadores. */
export interface AssignableEvaluationType {
  id: string;
  slug: string;
  kind: EvaluationKind;
  title: string;
  /** 0 = instrumento ainda sem perguntas cadastradas (não pode ser atribuído). */
  questionCount: number;
}

/** Uma competência na consolidação (imagem 3): notas por avaliador + médias. */
export interface EfficacyCompetencyRow {
  label: string;
  /** Notas por avaliador na ordem de envio; null = não respondeu. Anônimo. */
  raterScores: (number | null)[];
  /** Média de feedback (2 casas) ou null se ninguém respondeu. */
  feedbackAvg: number | null;
  /** Pontuação de autoavaliação ou null se ainda não enviada. */
  selfScore: number | null;
}

/** Consolidação completa de uma rodada — exclusivo do RH. */
export interface EfficacyConsolidated {
  roundId: string;
  typeTitle: string;
  typeSlug: string;
  scaleMax: number;
  scaleLabels: string[];
  subjectName: string;
  sector: string;
  /** Abertura da rodada. */
  startedAtLabel: string;
  /** Fechamento (só quando a autoavaliação chega). */
  finishedAtLabel?: string;
  finishedAtTimeLabel?: string;
  raterCount: number;
  raterQuota: number;
  hasSelf: boolean;
  status: EfficacyRoundStatus;
  competencies: EfficacyCompetencyRow[];
  overallFeedback: number | null;
  overallSelf: number | null;
}

/** Tarefa na aba "Minhas avaliações" do usuário logado. */
export interface MyEvaluationTask {
  kind: "FEEDBACK" | "AUTOAVALIACAO";
  roundId: string;
  typeSlug: string;
  typeTitle: string;
  /** Nome do avaliado (ou "Você" na autoavaliação). */
  subjectName: string;
  self: boolean;
}
