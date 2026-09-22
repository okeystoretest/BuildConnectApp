import { isPassing } from "@/lib/video-comprehension";

/**
 * A matemática do painel "Meu Setor". O banco entrega linhas; aqui se decide
 * os números, e os testes rodam sem banco.
 *
 * A regra da média, definida em 22/09: soma das notas APROVADAS dividida pela
 * quantidade de notas aprovadas. Tentativas reprovadas continuam visíveis na
 * listagem, com a nota, mas não entram no cálculo.
 *
 * Consequência aceita: a média nunca fica abaixo de 7 — ela varia só entre
 * 7,0 e 10,0. Quem foi reprovado cinco vezes e passou com 7 exibe a mesma
 * média de quem passou de primeira. É por isso que `MemberOverview` carrega
 * `rejections`: depois da exclusão, é ali que mora a informação sobre
 * dificuldade, e sem ela o painel ficaria cego para o que existe para detectar.
 */

export interface GradeRow {
  grade: number;
}

/** Uma nota que Gestor/Admin já deu a este colaborador, para a caixa "Avaliações". */
export interface MemberEvaluation {
  id: string;
  videoTitle: string;
  /** 1–10. */
  grade: number;
  /** 1 na primeira resposta; +1 a cada reprovação. */
  attempt: number;
  gradedAtLabel: string;
  /** Derivado da nota, para a tela não repetir a regra do 7. */
  passed: boolean;
}

/** Um colaborador no painel do setor. */
export interface MemberOverview {
  userId: string;
  name: string;
  /** Papel (Colaborador / Gestor / Admin) — o cadastro não guarda cargo. */
  role: string;
  avatarPath?: string;
  /** Data de CADASTRO. Não é admissão, e a tela diz isso com todas as letras. */
  sinceLabel: string;
  doneItems: number;
  totalItems: number;
  progress: number;
  /** Nula quando não há nenhuma nota aprovada. Nulo não é zero. */
  average: number | null;
  rejections: number;
  pending: number;
  /** Da mais recente para a mais antiga. */
  evaluations: MemberEvaluation[];
}

/** Em que ponto do conteúdo a pessoa está. */
export type MemberStatus = "NAO_INICIADO" | "EM_ANDAMENTO" | "CONCLUIDO";

/**
 * Status a partir do progresso, e não de um campo no banco: o estado é
 * consequência do que foi concluído, e guardá-lo à parte criaria uma segunda
 * verdade que envelhece.
 *
 * Setor sem conteúdo nenhum é "não iniciado", nunca "concluído": ninguém
 * terminou uma trilha que não existe, e `progressPct` devolve 0 nesse caso.
 */
export function memberStatus(done: number, total: number): MemberStatus {
  if (total === 0 || done === 0) return "NAO_INICIADO";
  return done >= total ? "CONCLUIDO" : "EM_ANDAMENTO";
}

/** Aprovadas de um lado, contagem de reprovações do outro. */
export function splitGrades(rows: readonly GradeRow[]): {
  approved: number[];
  rejections: number;
} {
  const approved: number[] = [];
  let rejections = 0;
  for (const row of rows) {
    if (isPassing(row.grade)) approved.push(row.grade);
    else rejections += 1;
  }
  return { approved, rejections };
}

/**
 * Média de uma casa decimal das notas JÁ FILTRADAS por `splitGrades`. Nula sem
 * nenhuma: marcar como péssimo quem apenas ainda não foi avaliado seria pior
 * que não informar.
 */
export function approvedAverage(grades: readonly number[]): number | null {
  if (grades.length === 0) return null;
  return Math.round((grades.reduce((a, g) => a + g, 0) / grades.length) * 10) / 10;
}

/** Percentual inteiro. Total zero devolve 0 em vez de estourar. */
export function progressPct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
