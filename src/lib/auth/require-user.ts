import { getSession } from "./session";
import { prisma } from "@/lib/db/prisma";

/**
 * Resolve o usuário autenticado a partir da sessão, para uso em Server
 * Actions. Retorna null quando não há sessão válida ou o usuário sumiu/
 * foi desativado — o chamador decide a resposta (erro tratado, redirect).
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user || !user.active) return null;
  return user;
}
