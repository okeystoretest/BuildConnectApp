import { notFound, redirect } from "next/navigation";
import { Users } from "lucide-react";
import { LOGIN_EXPIRED_PATH } from "@/lib/auth/login-redirect";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSectorOverview, listScopesForOverview } from "@/lib/sector-overview-data";
import { SectorOverviewView } from "@/components/sector-overview/sector-overview-view";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function MySectorPage({
  searchParams,
}: {
  searchParams: Promise<{ setor?: string; subsetor?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_EXPIRED_PATH);

  /*
   * `notFound()` e não `redirect()`, como em /setores/rh: para quem não tem a
   * permissão, a rota não existe. Um desvio para a home confirmaria que ela
   * existe e que a pessoa não tem acesso — informação que ela não precisa ter.
   */
  const role = user.role as Role;
  if (!can(role, "sector.overview")) notFound();

  const isAdmin = role === "ADMIN";
  const scopes = isAdmin ? await listScopesForOverview() : [];
  const { setor, subsetor } = await searchParams;

  /*
   * O Gestor é preso ao próprio setor: os parâmetros da URL são ignorados para
   * ele. Forjar `?setor=` ou `?subsetor=` não abre o painel de outro setor —
   * as pílulas são do Admin, e esta é a linha que faz disso verdade, não a
   * ausência do seletor na tela.
   */
  const sectorId = isAdmin ? (setor ?? scopes[0]?.sectorId ?? null) : user.sectorId;
  const subsectorId = isAdmin ? subsetor : undefined;

  if (!sectorId) {
    return (
      <AppShell eyebrow="Menu" title="Meu Setor">
        <PageHeader title="Meu Setor" description="Avanço dos colaboradores nos treinamentos." />
        <Card className="mt-6 p-5">
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Nenhum setor vinculado ao seu cadastro"
            description="Peça ao Admin para vincular você a um setor — o painel mostra o avanço das pessoas do setor em que você está lotado."
          />
        </Card>
      </AppShell>
    );
  }

  /*
   * Admin com parâmetro forjado: só vale a combinação que existe. Conferir o
   * subsetor contra a lista (e não só a existência dele) é o que impede pedir
   * um subsetor de OUTRO setor junto de um `?setor=` válido.
   */
  if (isAdmin) {
    const valid = scopes.some(
      (s) => s.sectorId === sectorId && s.subsectorId === (subsectorId || undefined),
    );
    if (!valid) notFound();
  }

  const data = await getSectorOverview({ sectorId, subsectorId: subsectorId || undefined });

  return (
    <AppShell eyebrow="Menu" title="Meu Setor">
      <PageHeader
        // O setor vai junto do subsetor: "Logística Interna" sozinho não diz
        // de quem é, e dois setores podem ter subsetores de nome parecido.
        title={
          data.subsectorLabel
            ? `Meu Setor · ${data.sectorLabel} › ${data.subsectorLabel}`
            : `Meu Setor · ${data.sectorLabel}`
        }
        description="Avanço dos colaboradores nos treinamentos e o que eles acharam dos vídeos."
      />
      <SectorOverviewView data={data} scopes={scopes} />
    </AppShell>
  );
}
