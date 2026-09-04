export type FormStatus = "RASCUNHO" | "PUBLICADO" | "ENCERRADO";

export type FormQuestionKind =
  | "TEXTO_CURTO"
  | "PARAGRAFO"
  | "MULTIPLA_ESCOLHA"
  | "CAIXAS_SELECAO"
  | "LISTA_SUSPENSA"
  | "ESCALA_LINEAR";

/** Tipos cuja resposta é escolher entre opções cadastradas. */
export const KINDS_WITH_OPTIONS: readonly FormQuestionKind[] = [
  "MULTIPLA_ESCOLHA",
  "CAIXAS_SELECAO",
  "LISTA_SUSPENSA",
];

/** Rótulo de cada tipo no seletor do construtor. */
export const QUESTION_KIND_LABEL: Record<FormQuestionKind, string> = {
  TEXTO_CURTO: "Resposta curta",
  PARAGRAFO: "Parágrafo",
  MULTIPLA_ESCOLHA: "Múltipla escolha",
  CAIXAS_SELECAO: "Caixas de seleção",
  LISTA_SUSPENSA: "Lista suspensa",
  ESCALA_LINEAR: "Escala linear",
};

/** Ordem de exibição no seletor, agrupando os parecidos. */
export const QUESTION_KIND_ORDER: readonly FormQuestionKind[] = [
  "TEXTO_CURTO",
  "PARAGRAFO",
  "MULTIPLA_ESCOLHA",
  "CAIXAS_SELECAO",
  "LISTA_SUSPENSA",
  "ESCALA_LINEAR",
];

/** Rótulo do status, para a listagem do DHO. */
export const FORM_STATUS_LABEL: Record<FormStatus, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADO: "Publicado",
  ENCERRADO: "Encerrado",
};

export interface FormOptionDraft {
  id: string;
  label: string;
  order: number;
}

export interface FormQuestionDraft {
  id: string;
  kind: FormQuestionKind;
  label: string;
  helpText?: string;
  required: boolean;
  order: number;
  options: FormOptionDraft[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

export interface FormSectionDraft {
  id: string;
  title: string;
  description?: string;
  order: number;
  questions: FormQuestionDraft[];
}

/**
 * Formulário completo. Serve ao construtor (onde vira estado local até o
 * "Salvar") e ao preenchimento (onde é só leitura).
 */
export interface FormDraft {
  id: string;
  title: string;
  description?: string;
  status: FormStatus;
  anonymous: boolean;
  dueAt?: string;
  /** Rodada em curso. Reabrir incrementa; as respostas antigas ficam na sua. */
  currentRound: number;
  sections: FormSectionDraft[];
}

/** Linha da listagem no bloco "Formulários" do DHO. */
export interface FormListItem {
  id: string;
  title: string;
  status: FormStatus;
  anonymous: boolean;
  responseCount: number;
  assignedCount: number;
  createdAtLabel: string;
}

/** Uma resposta enviada, no formato que a Server Action recebe. */
export interface FormAnswerInput {
  questionId: string;
  text?: string;
  number?: number;
  optionIds?: string[];
}

/** Limites da escala linear no construtor. */
export const SCALE_MIN_CHOICES: readonly number[] = [0, 1];
export const SCALE_MAX_CHOICES: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10];
