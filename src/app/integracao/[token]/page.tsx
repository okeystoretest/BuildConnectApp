import { notFound } from "next/navigation";
import { COMPANY_STORY, COMPANY_VALUES, CULTURE_TEXT } from "@/lib/company-info";
import { getLibrary, getTrail, lastAttempts, resolveGuest, resolveInvite } from "@/lib/integration/data";
import { IntegrationView } from "@/components/integration/integration-view";
import type { AttemptSummary } from "@/types/integration";

/**
 * Página de Integração — módulo ISOLADO, para quem não tem conta.
 *
 * Alcançável só pelo convite que o DHO gera com nome e telefone do
 * destinatário. Não há item de navegação para cá, nem nada daqui leva ao
 * sistema principal: o convidado vê a empresa, assiste os filmes em ordem,
 * responde os questionários e acabou.
 *
 * O token morar no CAMINHO, e não numa query, é o que permite revogá-lo sem
 * tocar nos outros convites.
 *
 * `notFound()` para convite inválido, revogado à mão ou já encerrado pela
 * conclusão da trilha. Não é uma tela de erro de propósito: uma mensagem de
 * "convite revogado" confirmaria que o endereço é real e que há algo atrás
 * dele.
 */

export const dynamic = "force-dynamic";

export default async function IntegrationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await resolveInvite(token);
  if (!invite) notFound();

  /**
   * Entrou SÓ se o cookie for deste convite. Quem guardou o cookie de um
   * convite antigo e abriu um novo volta à tela de boas-vindas — as
   * tentativas pertencem a quem foi convidado, e misturá-las bagunçaria o
   * quadro do DHO.
   */
  const guest = await resolveGuest();
  const entered = guest?.guestId === invite.id ? guest : null;

  const [films, library, attempts] = await Promise.all([
    getTrail(entered?.guestId ?? null),
    getLibrary(),
    entered ? lastAttempts(entered.guestId) : Promise.resolve(new Map<string, AttemptSummary>()),
  ]);

  return (
    <IntegrationView
      token={token}
      guestName={invite.fullName}
      entered={entered !== null}
      films={films}
      attempts={Object.fromEntries(attempts)}
      library={library}
      values={COMPANY_VALUES}
      culture={CULTURE_TEXT}
      story={COMPANY_STORY}
    />
  );
}
