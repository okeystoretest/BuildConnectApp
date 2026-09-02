import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { getSession, type SessionPayload } from "./session";

/**
 * Duas formas de resolver quem está pedindo, ambas revalidando no banco.
 *
 * O cookie é assinado, mas é uma FOTOGRAFIA do momento do login: papel,
 * nome e situação da conta podem ter mudado depois. Por isso todo caminho que
 * decide acesso a dado sensível passa por aqui, e não pelo getSession direto.
 *
 * A conferência de `sessionVersion` é o que dá efeito imediato a trocar a
 * senha, mudar o papel ou desativar a conta: o número no cookie deixa de bater
 * com o do banco e a sessão morre na requisição seguinte, sem esperar o `exp`.
 *
 * `cache` do React memoiza por requisição: layout e página compartilham a
 * mesma consulta em vez de fazerem uma cada.
 */

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user || !user.active) return null;
  if (session.v !== user.sessionVersion) return null;
  return user;
});

/**
 * Mesma validação, no formato do payload da sessão — para as páginas, que
 * consomem rótulos (nome, setor, avatar) além do papel. Os campos voláteis
 * vêm do BANCO; o cookie entra só com o que não muda sozinho (userId,
 * username) e com os accessSlugs do menu, que toda página que restringe
 * acesso recalcula por conta própria.
 */
export const getVerifiedSession = cache(async (): Promise<SessionPayload | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      role: true,
      active: true,
      sessionVersion: true,
      fullName: true,
      avatarPath: true,
      sector: { select: { label: true } },
    },
  });

  if (!user || !user.active) return null;
  if (session.v !== user.sessionVersion) return null;

  return {
    ...session,
    role: user.role,
    fullName: user.fullName,
    avatarPath: user.avatarPath,
    sector: user.sector?.label ?? null,
  };
});
