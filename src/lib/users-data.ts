import { prisma } from "@/lib/db/prisma";
import type { ManagedUser } from "@/types/hr";
import type { Role } from "@/types";

/**
 * Lista de usuários para o painel de Gestão de Usuários (RH).
 * Traz setor, subsetores e o avatar (.webp) resolvidos para exibição.
 */
export async function getManagedUsers(): Promise<ManagedUser[]> {
  const rows = await prisma.user.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    include: {
      sector: { select: { label: true } },
      subsectors: { include: { subsector: { select: { label: true } } } },
    },
  });

  return rows.map((u: {
    id: string; fullName: string; username: string; role: string;
    avatarPath: string | null;
    sector: { label: string } | null;
    subsectors: { subsector: { label: string } }[];
  }) => ({
    id: u.id,
    name: u.fullName,
    username: u.username,
    role: u.role as Role,
    sector: u.sector?.label ?? "—",
    subsectors:
      u.subsectors.map((s: { subsector: { label: string } }) => s.subsector.label).join(", ") || "—",
    avatarPath: u.avatarPath ?? undefined,
  }));
}
