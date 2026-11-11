"use server";

import { prisma } from "@/lib/db/prisma";
import { consume, clientIp } from "@/lib/rate-limit";
import { createGuestSession } from "./guest-session";
import { resolveGuest, resolveInvite } from "./data";
import { concludeFilmFor, submitQuizFor } from "./guest-core";
import type { ConfirmResult, SubmitResult } from "@/types/integration";

/**
 * Canal PÚBLICO da Página de Integração.
 *
 * Tudo aqui roda SEM sessão do sistema — é o requisito: o convidado não tem
 * conta e não deve ter. Em troca, a superfície é estreita de propósito:
 *
 *  - entrar exige um convite válido e não revogado, e tem teto por IP;
 *  - responder exige cookie de convidado E que o filme esteja LIBERADO pela
 *    trilha — conferido no servidor, nunca confiando na tela;
 *  - nada aqui lê, escreve ou devolve qualquer coisa do sistema principal.
 *
 * Este arquivo só faz o que é do Next: resolver o cookie e aplicar os tetos. A
 * REGRA mora em `guest-core.ts`, que recebe o convidado por parâmetro e por
 * isso é testável contra um banco de verdade.
 *
 * Arquivo "use server": todo export é Server Action. Os tipos moram em
 * `types/integration` — exportar um objeto daqui quebra a compilação.
 */

const CONFIRM_WINDOW_MS = 60 * 60 * 1000;
const MAX_CONFIRMS_PER_IP = 60;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMITS_PER_GUEST = 60;

const EXPIRADA = "Seu acesso foi encerrado. Fale com o time de Desenvolvimento Humano.";

/**
 * Entrada no convite: o convidado confirma que é ele.
 *
 * Não digita o nome — o DHO já o cadastrou ao gerar o convite, junto do
 * telefone. Confirmar em vez de digitar fecha duas portas de uma vez: ninguém
 * se identifica errado no quadro do DHO, e ninguém entra com o nome de outro
 * por um link que recebeu encaminhado.
 */
export async function confirmEntry(token: string): Promise<ConfirmResult> {
  const ip = await clientIp();
  const limite = await consume(`integracao:entrar:${ip}`, MAX_CONFIRMS_PER_IP, CONFIRM_WINDOW_MS);
  if (!limite.ok) {
    return { ok: false, error: "Muitas tentativas. Tente novamente mais tarde." };
  }

  const invite = await resolveInvite(token);
  if (!invite) {
    return { ok: false, error: "Este convite não é mais válido." };
  }

  try {
    // `confirmedAt` só na PRIMEIRA entrada: recarregar a página não reescreve
    // a hora em que a pessoa chegou, que é o que o quadro do DHO exibe.
    await prisma.integrationGuest.updateMany({
      where: { id: invite.id, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
    await createGuestSession({ guestId: invite.id, fullName: invite.fullName });
    return { ok: true };
  } catch (error) {
    console.error("[confirmEntry] falha:", error);
    return { ok: false, error: "Não foi possível registrar sua entrada." };
  }
}

/** Conclui um filme SEM questionário (o vídeo chegou ao fim). */
export async function concludeFilm(assetId: string): Promise<SubmitResult> {
  const guest = await resolveGuest();
  if (!guest) return { ok: false, error: EXPIRADA };
  return concludeFilmFor(guest.guestId, assetId);
}

/**
 * Envio do questionário do filme.
 *
 * Recebe pares pergunta→alternativa. A correção é no servidor, contra o
 * gabarito que nunca saiu de lá.
 */
export async function submitQuiz(
  assetId: string,
  answers: { questionId: string; optionId: string }[],
): Promise<SubmitResult> {
  const guest = await resolveGuest();
  if (!guest) return { ok: false, error: EXPIRADA };

  const limite = await consume(
    `integracao:responder:${guest.guestId}`,
    MAX_SUBMITS_PER_GUEST,
    SUBMIT_WINDOW_MS,
  );
  if (!limite.ok) return { ok: false, error: "Muitos envios. Aguarde alguns minutos." };

  return submitQuizFor(guest.guestId, assetId, new Map(answers.map((a) => [a.questionId, a.optionId])));
}
