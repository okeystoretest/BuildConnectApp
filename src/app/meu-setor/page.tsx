import { notFound, redirect } from "next/navigation";
import { Users } from "lucide-react";
import { LOGIN_EXPIRED_PATH } from "@/lib/auth/login-redirect";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getSectorOverview,
  listScopesForOverview,
  resolveEvaluationsHref,
} from "@/lib/sector-overview-data";
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

  /*
   * O Gestor TAMBÉM recebe escopos — os subsetores do setor dele. Ele não
   * escolhe setor (a linha do `sectorId` abaixo ignora o `?setor=`), mas
   * filtra dentro do próprio, que é para o que a pílula de subsetor serve.
   * Sem lotação não há o que listar, e a tela já responde isso adiante.
   */
  const scopes =
    isAdmin || user.sectorId ? await listScopesForOverview(isAdmin ? null : user.sectorId) : [];
  const { setor, subsetor } = await searchParams;

  /*
   * O Gestor é preso ao próprio setor: o parâmetro da URL é ignorado para ele.
   * Forjar `?setor=` não abre o painel de outro setor — as pílulas são do
   * Admin, e esta é a linha que faz disso verdade, não a ausência do seletor
   * na tela.
   *
   * O `?subsetor=` voltou a ser lido em 11/11, e é validado logo abaixo.
   */
  const sectorId = isAdmin ? (setor ?? scopes[0]?.sectorId ?? null) : user.sectorId;

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

  // Admin com parâmetro forjado: só vale setor que existe.
  if (isAdmin && !scopes.some((s) => s.sectorId === sectorId)) notFound();

  /*
   * `?subsetor=` forjado é IGNORADO, não recusado: só vale subsetor do setor
   * que está aberto. Dois motivos para ignorar em vez de dar 404 — um link
   * antigo abre o setor inteiro em vez de uma tela de erro, e um id de outro
   * setor não vira um jeito de descobrir o que existe lá.
   */
  const aberto = scopes.find((s) => s.sectorId === sectorId);
  const subsectorId =
    subsetor && aberto?.subsectors.some((s) => s.subsectorId === subsetor) ? subsetor : null;

  const data = await getSectorOverview({ sectorId, subsectorId });

  /*
   * Destino do atalho das avaliações pendentes. Resolvido AQUI, a partir de
   * quem abriu a página: é o avaliador que vai clicar, e o alcance dele é o
   * que decide se o link abre. Uma vez por carga, não por card.
   *
   * Quem não pode preencher avaliação não recebe atalho — a aba de destino
   * recusaria a pessoa, e o card não deve oferecer o que seria negado.
   */
  const evaluationsHref = can(role, "evaluations.view")
    ? await resolveEvaluationsHref(user.id, role, sectorId)
    : null;

  /*
   * O bloco de Documentos é do VISITANTE: Admin sempre, Gestor só com a
   * permissão marcada no cadastro. Lido do banco a cada carga — desmarcar vale
   * na próxima abertura da página, sem derrubar a sessão de ninguém.
   *
   * Esconder o bloco não é a proteção: a action e a rota de imagem conferem a
   * mesma regra. Isto é só para não oferecer o que seria recusado.
   */
  const canSeeDocuments = isAdmin || user.canViewSectorDocs;

  return (
    <AppShell eyebrow="Menu" title="Meu Setor">
      <PageHeader
        // O subsetor entra no título porque os números abaixo passam a ser
        // dele: sem isso, "3 colaboradores" num setor de 30 lê como erro.
        title={`Meu Setor · ${data.sectorLabel}${
          data.subsectorLabel ? ` · ${data.subsectorLabel}` : ""
        }`}
        description="Avanço dos colaboradores nos treinamentos e o que eles acharam dos vídeos."
      />
      <SectorOverviewView
        data={data}
        scopes={scopes}
        canSeeDocuments={canSeeDocuments}
        evaluationsHref={evaluationsHref}
      />
    </AppShell>
  );
}
