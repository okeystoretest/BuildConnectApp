import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { getSectorContent } from "@/lib/sector-data";
import {
  getDriverTickets,
  getDriverDashboard,
  getDriverLogistics,
} from "@/lib/driver-data-db";
import { DriverSectorView } from "@/components/it/driver-sector-view";
import { getSectorEvaluations } from "@/lib/sector-evaluations-data";
import { getSectorWelcomeVideo } from "@/lib/welcome-video-data";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function DriversSectorPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // RBAC: barra acesso direto por URL a quem não tem o subsetor "motoristas".
  const slugs = await resolveAccessibleSlugs(session.userId, session.role as Role);
  if (!canAccessSlug(slugs, "motoristas")) notFound();

  const [content, tickets, dashboard, logistics] = await Promise.all([
    getSectorContent("motoristas", session.userId),
    getDriverTickets(),
    getDriverDashboard(),
    getDriverLogistics(),
  ]);

  const safeContent = content ?? {
    slug: "motoristas",
    name: "Motoristas",
    parent: "Logística",
    kind: "PADRAO" as const,
    description: "Central de chamados e conteúdos da equipe de rota.",
    completion: 0,
    photos: [],
    videos: [],
    workshops: [],
    documents: [],
    links: [],
  };

  // Avaliações do setor (Gestor/Admin preenchem aqui). Motoristas é subsetor
  // de Logística; o escopo resolve o setor-pai no helper.
  const evaluations = await getSectorEvaluations("motoristas", (session.role as Role) === "ADMIN");
  const welcome = await getSectorWelcomeVideo("motoristas", session.userId);

  return (
    <DriverSectorView
      content={safeContent}
      tickets={tickets}
      dashboard={dashboard}
      logistics={logistics}
      evaluations={evaluations}
      welcome={welcome}
    />
  );
}
