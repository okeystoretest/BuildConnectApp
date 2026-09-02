import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { SectorPage } from "@/components/sector/sector-page";
import { getSectorContent } from "@/lib/sector-data";
import { getSectorEvaluations } from "@/lib/sector-evaluations-data";
import { getCronogramaData } from "@/lib/cronograma-data";
import { getSectorWelcomeVideo } from "@/lib/welcome-video-data";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/types";

/** Query da URL depois de resolvida (Next 15 entrega como Promise). */
type SectorSearchParams = { aba?: string; ano?: string; mes?: string };

interface PageProps {
  params: Promise<{ slug: string }>;
  /** `aba`, `ano` e `mes` guardam o estado do Cronograma na URL. */
  searchParams?: Promise<SectorSearchParams>;
}

// Conteúdo depende do usuário (progresso), então a rota é dinâmica.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const sub = await prisma.subsector.findUnique({
    where: { slug },
    select: { label: true },
  });
  return {
    title: sub ? `${sub.label} · Build.Connect` : "Setor não encontrado · Build.Connect",
  };
}

/** Mês exibido no Cronograma: o da URL quando válido, senão o atual. */
function resolveMonth(searchParams?: SectorSearchParams) {
  const now = new Date();
  const year = Number(searchParams?.ano);
  const month = Number(searchParams?.mes);
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12;

  return {
    year: validYear ? year : now.getFullYear(),
    month: validMonth ? month : now.getMonth() + 1,
  };
}

export default async function Page({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  const role = session.role as Role;

  // RBAC: barra acesso direto por URL a subsetores fora do escopo do usuário.
  const slugs = await resolveAccessibleSlugs(session.userId, role);
  if (!canAccessSlug(slugs, slug)) notFound();

  const sector = await getSectorContent(slug, session.userId);
  if (!sector) notFound();

  // Avaliações (preenchimento) ficam na aba Avaliações do próprio setor.
  // Só carrega para quem pode preencher (Gestor/Admin). RH é excluído no helper.
  const evaluations = can(role, "evaluations.view")
    ? await getSectorEvaluations(slug, role === "ADMIN")
    : null;

  // Cronograma: null quando o subsetor (ou sua origem) não habilita a ferramenta.
  const { year, month } = resolveMonth(query);
  const cronograma = await getCronogramaData(
    slug,
    year,
    month,
    session.userId,
    role,
  );

  const welcome = await getSectorWelcomeVideo(slug, session.userId);

  return (
    <SectorPage
      sector={sector}
      welcome={welcome}
      evaluations={evaluations}
      cronograma={cronograma}
      initialTab={query?.aba}
    />
  );
}
