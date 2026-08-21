import { PrismaClient } from "@prisma/client";

/**
 * Singleton do Prisma.
 * O hot-reload do Next em desenvolvimento reinstancia módulos a cada
 * alteração; sem o cache global, cada reload abriria uma nova pool de
 * conexões e o Postgres logo recusaria por excesso.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
