/**
 * Constantes da pergunta de compreensão das Instruções em Vídeo, partilhadas
 * pelo formulário (cliente) e pela Server Action (validação).
 */
export const COMPREHENSION_QUESTION = "Você compreendeu a atividade? Pode explicar um pouco?";
export const COMPREHENSION_MIN = 10;
export const COMPREHENSION_MAX = 4000;
export const COMPREHENSION_GRADE_MAX = 10;

/**
 * Vídeo da ferramenta Instruções em Vídeo — o que tem a pergunta de
 * compreensão. A aba é identificada assim, e não por `kind = INSTRUCAO`: os
 * setores padrão mostram ali todo vídeo que não é WORKSHOP (há `VIDEO` antigos).
 */
export function hasComprehension(video: {
  kind: string;
  subsector: { kind: string };
}): boolean {
  return video.kind !== "WORKSHOP" && video.subsector.kind === "PADRAO";
}

/** Menor nota que o Gestor pode dar. A escala era 0–10 até 22/09. */
export const COMPREHENSION_GRADE_MIN = 1;

/** A partir daqui o colaborador está aprovado e o vídeo fica concluído. */
export const COMPREHENSION_PASS_MIN = 7;

export function isPassing(grade: number): boolean {
  return grade >= COMPREHENSION_PASS_MIN;
}

/**
 * Quanto destaque o vídeo reprovado recebe em Meu Progresso. Satura em 2: a
 * terceira reprovação e as seguintes repetem o tratamento da segunda — não há
 * teto de tentativas, e escalar a cor para sempre não comunica nada.
 */
export function rejectionLevel(rejections: number): 0 | 1 | 2 {
  if (rejections <= 0) return 0;
  return rejections === 1 ? 1 : 2;
}
