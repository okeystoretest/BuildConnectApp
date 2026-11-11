export type IntegrationAssetKind = "FILME" | "VIDEO" | "DOCUMENTO";

/** Situação de um filme na trilha, do ponto de vista de UM convidado. */
export type FilmState = "CONCLUIDO" | "LIBERADO" | "TRANCADO";

/** Uma alternativa, como chega à tela: SEM o gabarito. */
export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  label: string;
  options: QuizOption[];
}

/** Um filme da trilha, já resolvido para a tela. */
export interface TrailFilm {
  id: string;
  title: string;
  focus?: string;
  lesson?: string;
  /** Nulo enquanto o DHO não subiu o arquivo: o filme aparece indisponível. */
  filePath: string | null;
  order: number;
  /** Perguntas renderizadas no MESMO bloco do vídeo, sem gabarito. */
  questions: QuizQuestion[];
  state: FilmState;
}

/** Resultado da última tentativa de um filme, para a tela explicar o retorno. */
export interface AttemptSummary {
  correctCount: number;
  totalCount: number;
  passed: boolean;
}

/** Peça do acervo complementar (vídeo ou documento), fora da trilha. */
export interface LibraryItem {
  id: string;
  kind: "VIDEO" | "DOCUMENTO";
  title: string;
  filePath: string;
}

/** Resultado de confirmar a entrada no convite. */
export interface ConfirmResult {
  ok: boolean;
  error?: string;
}

/** Resultado de enviar o questionário de um filme. */
export interface SubmitResult {
  ok: boolean;
  error?: string;
  /** Presente quando o envio foi corrigido: o que a tela mostra ao convidado. */
  correctCount?: number;
  totalCount?: number;
  passed?: boolean;
  /** A trilha inteira terminou com aproveitamento — o convite se fecha. */
  finished?: boolean;
}

// ─── Lado do DHO ───────────────────────────────────────────────────────────

/**
 * Em qual coluna do quadro o convidado aparece. A regra mora em
 * `lib/integration/access`, junto das outras que leem `completedAt`.
 */
import type { GuestColumn } from "@/lib/integration/access";
export type { GuestColumn };

/** Um convidado no quadro do DHO. */
export interface GuestCard {
  id: string;
  fullName: string;
  phone: string | null;
  /** Abriu o convite e confirmou o nome. */
  confirmed: boolean;
  revoked: boolean;
  column: GuestColumn;
  /** Filmes aprovados e total de filmes da trilha. */
  approvedCount: number;
  filmCount: number;
  /** Tentativas reprovadas acumuladas — o que motiva a cobrança. */
  failedCount: number;
  invitedAtLabel: string;
  /** Quando terminou a trilha. Null = ainda não terminou. */
  completedAtLabel: string | null;
  createdByName: string;
  token: string;
}

/** Uma peça da página (filme, vídeo ou documento), na gestão do DHO. */
export interface IntegrationAssetRow {
  id: string;
  kind: IntegrationAssetKind;
  title: string;
  focus?: string;
  lesson?: string;
  /** Falso enquanto o arquivo não foi enviado: a peça fica indisponível. */
  hasFile: boolean;
  hasCover: boolean;
  order: number;
  questionCount: number;
}

/** Tudo que o quadro do DHO precisa numa carga. */
export interface IntegrationAdminData {
  assets: IntegrationAssetRow[];
  guests: GuestCard[];
}

/** Uma pergunta respondida, com o que o convidado marcou e o que era certo. */
export interface GuestAnswerRow {
  question: string;
  answer: string;
  correct: boolean;
  expected: string;
}

/** Uma tentativa de um convidado em um filme, para o DHO ler. */
export interface GuestAttemptDetail {
  id: string;
  filmTitle: string;
  scoreLabel: string;
  passed: boolean;
  submittedAtLabel: string;
  answers: GuestAnswerRow[];
}

/** Uma alternativa no editor do DHO — aqui o gabarito aparece. */
export interface OptionDraft {
  /** Ausente numa alternativa recém-criada na tela. */
  id?: string;
  label: string;
  correct: boolean;
}

/** Uma pergunta no editor do DHO. */
export interface QuestionDraft {
  /** Ausente numa pergunta recém-criada na tela. */
  id?: string;
  label: string;
  options: OptionDraft[];
}

/** O que gravar a edição DESTRUIRIA: respostas já dadas. */
export interface QuestionRemoval {
  kind: "pergunta" | "alternativa";
  label: string;
  /** Respostas de convidados que somem junto. */
  affected: number;
}

export interface SaveQuestionsResult {
  ok: boolean;
  error?: string;
  /** Presente só quando a gravação é recusada por perda de dado. */
  removals?: QuestionRemoval[];
}
