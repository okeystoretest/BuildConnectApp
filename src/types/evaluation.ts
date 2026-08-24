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

/** Resultado completo para a aba de Resultados (RH). */
export interface EvaluationResultDetail {
  id: string;
  typeTitle: string;
  subjectName: string;
  evaluatorName?: string;
  cycle?: number;
  total: number;
  maxTotal: number;
  /** Rótulos da escala, para exibir E/S/R/I no lugar de números. */
  scaleLabels: string[];
  observations?: string;
  createdAtLabel: string;
  answers: readonly { label: string; value: number }[];
}

/** Agrupamento de resultados por colaborador para a aba de Resultados. */
export interface EvaluationResultGroup {
  subjectId: string;
  subjectName: string;
  sector: string;
  results: readonly EvaluationResultSummary[];
}

export interface EvaluationResultSummary {
  id: string;
  typeTitle: string;
  kind: EvaluationKind;
  cycle?: number;
  total: number;
  maxTotal: number;
  createdAtLabel: string;
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

/** Linha da lista de rodadas de Eficácia (gestão do RH). */
export interface EfficacyRoundRow {
  id: string;
  subjectId: string;
  subjectName: string;
  sector: string;
  raterQuota: number;
  feedbackDone: number;
  status: EfficacyRoundStatus;
  selfDone: boolean;
  createdAtLabel: string;
  raters: EfficacyRaterState[];
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
  scaleMax: number;
  subjectName: string;
  sector: string;
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
