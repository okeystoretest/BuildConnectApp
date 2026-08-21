import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getSectorContent } from "@/lib/sector-data";
import { getItTickets, getItDashboard } from "@/lib/it-data-db";
import { ItSectorView } from "@/components/it/it-sector-view";
import { getSectorEvaluations } from "@/lib/sector-evaluations-data";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function ItSectorPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Retaguarda é restrito: só quem tem `sector.it` (ADMIN) acessa, mesmo por URL direta.
  if (!can(session.role as Role, "sector.it")) notFound();

  const [content, tickets, dashboard] = await Promise.all([
    getSectorContent("ti", session.userId),
    getItTickets(),
    getItDashboard(),
  ]);

  // Fallback de conteúdo vazio se o subsetor "ti" ainda não existir.
  const safeContent = content ?? {
    slug: "ti",
    name: "Retaguarda",
    parent: "Retaguarda",
    kind: "PADRAO" as const,
    description: "Gestão de chamados e conteúdos do setor de Retaguarda.",
    completion: 0,
    photos: [],
    videos: [],
    workshops: [],
    documents: [],
    links: [],
  };

  // Avaliações do setor Retaguarda (Gestor/Admin preenchem aqui).
  const evaluations = await getSectorEvaluations("ti", (session.role as Role) === "ADMIN");

  return (
    <ItSectorView
      content={safeContent}
      tickets={tickets}
      dashboard={dashboard}
      evaluations={evaluations}
    />
  );
}
