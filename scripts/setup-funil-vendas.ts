/**
 * Build.Connect — habilita a ferramenta Funil de Vendas.
 *
 * Faz uma coisa só, idempotente: liga `funnelEnabled` em Vendas, o subsetor
 * dono da base. Marketing e Criação herdam por `appsSourceId` e NÃO são
 * tocados — quem herda não configura, recebe.
 *
 * Não cria subsetor, não mexe em usuários, conteúdos ou avaliações. É o
 * caminho seguro para uma base já em uso, onde `prisma db seed` não deve ser
 * executado.
 *
 * Uso:
 *   npx tsx scripts/setup-funil-vendas.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const VENDAS_SLUG = "vendas";

async function main() {
  console.log("Build.Connect — setup do Funil de Vendas\n");

  const vendas = await prisma.subsector.findUnique({
    where: { slug: VENDAS_SLUG },
    select: { id: true, label: true },
  });
  if (!vendas) {
    throw new Error(
      'Subsetor "vendas" não encontrado. Rode `npx prisma db seed` antes — ele cria a estrutura base.',
    );
  }

  await prisma.subsector.update({
    where: { id: vendas.id },
    data: { funnelEnabled: true },
  });
  console.log(`  ✓ Funil de Vendas habilitado em ${vendas.label}`);

  // Conferência final — é isto que a aplicação lê para montar a aba.
  const check = await prisma.subsector.findMany({
    where: { OR: [{ id: vendas.id }, { appsSourceId: vendas.id }] },
    select: {
      slug: true,
      funnelEnabled: true,
      appsSource: { select: { slug: true } },
      _count: { select: { salesFunnels: true } },
    },
  });

  console.log("\nEstado atual:");
  for (const row of check) {
    const efetivo = row.appsSource ? "herda" : row.funnelEnabled ? "sim" : "não";
    console.log(
      `  ${row.slug.padEnd(10)} funil=${efetivo}` +
        `  herda=${row.appsSource?.slug ?? "—"}  funis=${row._count.salesFunnels}`,
    );
  }
  console.log("\nAbra /setores/vendas e /setores/marketing — a aba Funil de Vendas deve aparecer.");
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    console.error(
      "\nSe o erro citar coluna inexistente (funnelEnabled), a migration ainda não foi aplicada:" +
        "\n  npx prisma migrate deploy && npx prisma generate",
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
