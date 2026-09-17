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
