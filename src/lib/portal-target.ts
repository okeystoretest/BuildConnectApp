/**
 * Onde um modal deve se ancorar quando existe algo em tela cheia.
 *
 * O navegador só pinta a subárvore do elemento em FULLSCREEN. Um modal
 * ancorado no `body` enquanto o calendário está em tela cheia existiria no DOM
 * e ficaria invisível — por isso o portal acompanha `document.fullscreenElement`.
 *
 * A exceção é o que quebrava o vídeo de boas-vindas. O player pede tela cheia
 * no PRÓPRIO contêiner, que é descendente do modal. Sem a guarda abaixo, a
 * sequência era:
 *
 *   clique → o navegador entra em fullscreen e roda a animação
 *          → dispara `fullscreenchange`
 *          → o modal decide se mudar para dentro daquele contêiner
 *          → o React desmonta o portal, o contêiner sai do documento
 *          → o navegador cai fora do fullscreen sozinho.
 *
 * Animação sim, expansão não. Mover um nó para dentro de um descendente dele
 * mesmo não é uma mudança de alvo válida: quando o elemento em tela cheia já
 * está DENTRO do modal, o modal fica onde está e o fullscreen nativo cuida do
 * resto.
 */

/** Só o que este módulo precisa saber de um nó — mantém a regra testável. */
export interface ContainerNode {
  contains(other: unknown): boolean;
}

export function resolvePortalTarget<T extends ContainerNode>(
  /** `document.fullscreenElement`, ou null quando nada está em tela cheia. */
  fullscreenElement: T | null,
  /** Raiz já renderizada do próprio modal, ou null na primeira pintura. */
  modalRoot: ContainerNode | null,
  /** Destino padrão: `document.body`. */
  body: T,
): T {
  if (!fullscreenElement) return body;

  // Primeira pintura: o modal ainda não existe no DOM, então não há como ele
  // conter coisa alguma. É o caso do modal aberto a partir do calendário que
  // JÁ estava em tela cheia — ali o alvo correto é o elemento em fullscreen.
  if (modalRoot === null) return fullscreenElement;

  // O elemento em tela cheia é do próprio modal: não se muda para dentro de si.
  if (modalRoot.contains(fullscreenElement)) return body;

  return fullscreenElement;
}
