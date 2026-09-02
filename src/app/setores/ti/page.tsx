import { notFound, redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { getSectorContent } from "@/lib/sector-data";
import { getItTickets, getItDashboard } from "@/lib/it-data-db";
import { ItSectorView } from "@/components/it/it-sector-view";
import { getSectorEvaluations } from "@/lib/sector-evaluations-data";
import { getSectorWelcomeVideo } from "@/lib/welcome-video-data";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function ItSectorPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  // RBAC por subsetor, igual a Motoristas: entra quem está lotado na
  // Retaguarda (o setor tem um único subsetor homônimo, de slug "ti"), em
  // qualquer papel. ADMIN passa direto (resolveAccessibleSlugs devolve null).
  const slugs = await resolveAccessibleSlugs(session.userId, session.role as Role);
  if (!canAccessSlug(slugs, "ti")) notFound();

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
  const welcome = await getSectorWelcomeVideo("ti", session.userId);

  return (
    <ItSectorView
      welcome={welcome}
      content={safeContent}
      tickets={tickets}
      dashboard={dashboard}
      evaluations={evaluations}
    />
  );
}
