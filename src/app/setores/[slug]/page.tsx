import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { SectorPage } from "@/components/sector/sector-page";
import { getSectorContent } from "@/lib/sector-data";
import { getSectorEvaluations } from "@/lib/sector-evaluations-data";
import { getCronogramaData } from "@/lib/cronograma-data";
import { getSession } from "@/lib/auth/session";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/types";

interface PageProps {
  params: { slug: string };
  /** `aba`, `ano` e `mes` guardam o estado do Cronograma na URL. */
  searchParams?: { aba?: string; ano?: string; mes?: string };
}

// Conteúdo depende do usuário (progresso), então a rota é dinâmica.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const sub = await prisma.subsector.findUnique({
    where: { slug: params.slug },
    select: { label: true },
  });
  return {
    title: sub ? `${sub.label} · Build.Connect` : "Setor não encontrado · Build.Connect",
  };
}

/** Mês exibido no Cronograma: o da URL quando válido, senão o atual. */
function resolveMonth(searchParams?: PageProps["searchParams"]) {
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
  const session = await getSession();
  if (!session) redirect("/login");

  const role = session.role as Role;

  // RBAC: barra acesso direto por URL a subsetores fora do escopo do usuário.
  const slugs = await resolveAccessibleSlugs(session.userId, role);
  if (!canAccessSlug(slugs, params.slug)) notFound();

  const sector = await getSectorContent(params.slug, session.userId);
  if (!sector) notFound();

  // Avaliações (preenchimento) ficam na aba Avaliações do próprio setor.
  // Só carrega para quem pode preencher (Gestor/Admin). RH é excluído no helper.
  const evaluations = can(role, "evaluations.view")
    ? await getSectorEvaluations(params.slug, role === "ADMIN")
    : null;

  // Cronograma: null quando o subsetor (ou sua origem) não habilita a ferramenta.
  const { year, month } = resolveMonth(searchParams);
  const cronograma = await getCronogramaData(
    params.slug,
    year,
    month,
    session.userId,
    role,
  );

  return (
    <SectorPage
      sector={sector}
      evaluations={evaluations}
      cronograma={cronograma}
      initialTab={searchParams?.aba}
    />
  );
}
