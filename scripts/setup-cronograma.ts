/**
 * Build.Connect — provisiona a estrutura do Cronograma sem rodar o seed.
 *
 * Faz exatamente três coisas, todas idempotentes:
 *   1. Garante o subsetor "Marketing" dentro do setor Comercial.
 *   2. Habilita o Cronograma em Vendas (dono da base).
 *   3. Liga Marketing a Vendas (herança de aplicativos + cronograma).
 *
 * Não toca em usuários, chamados, conteúdos ou avaliações — é o caminho
 * seguro para um banco de produção já em uso, onde `prisma db seed` não deve
 * ser executado.
 *
 * Uso:
 *   npx tsx scripts/setup-cronograma.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMERCIAL_SLUG = "comercial";
const VENDAS_SLUG = "vendas";
const MARKETING_SLUG = "marketing";

async function main() {
  console.log("Build.Connect — setup do Cronograma\n");

  // 1) Setor Comercial precisa existir para pendurar o subsetor.
  const comercial = await prisma.sector.upsert({
    where: { slug: COMERCIAL_SLUG },
    update: {},
    create: { slug: COMERCIAL_SLUG, label: "Comercial", icon: "Store", order: 0 },
    select: { id: true, label: true },
  });
  console.log(`  ✓ setor ${comercial.label}`);

  // 2) Vendas é a base compartilhada. Sem ele não há o que herdar.
  const vendas = await prisma.subsector.findUnique({
    where: { slug: VENDAS_SLUG },
    select: { id: true, label: true },
  });
  if (!vendas) {
    throw new Error(
      'Subsetor "vendas" não encontrado. Rode `npx prisma db seed` antes — ele cria a estrutura base.',
    );
  }

  // 3) Marketing: cria se faltar, corrige o vínculo se já existir.
  const vendasOrder = await prisma.subsector.findUnique({
    where: { slug: VENDAS_SLUG },
    select: { order: true },
  });

  const marketing = await prisma.subsector.upsert({
    where: { slug: MARKETING_SLUG },
    update: {
      label: "Marketing",
      icon: "Megaphone",
      sectorId: comercial.id,
      appsSourceId: vendas.id,
      scheduleEnabled: true,
    },
    create: {
      slug: MARKETING_SLUG,
      label: "Marketing",
      icon: "Megaphone",
      kind: "PADRAO",
      order: (vendasOrder?.order ?? 2) + 1,
      sectorId: comercial.id,
      appsSourceId: vendas.id,
      scheduleEnabled: true,
    },
    select: { id: true, label: true },
  });
  console.log(`  ✓ subsetor ${marketing.label} vinculado a ${vendas.label}`);

  // 4) Cronograma habilitado na origem. Marketing herda por consequência.
  await prisma.subsector.update({
    where: { id: vendas.id },
    data: { scheduleEnabled: true, appsSourceId: null },
  });
  console.log(`  ✓ Cronograma habilitado em ${vendas.label}`);

  // 5) Conferência final — é isso que a aplicação lê para montar a aba.
  const check = await prisma.subsector.findMany({
    where: { slug: { in: [VENDAS_SLUG, MARKETING_SLUG] } },
    select: {
      slug: true,
      label: true,
      scheduleEnabled: true,
      appsSource: { select: { slug: true } },
      _count: { select: { links: true, posts: true } },
    },
  });

  console.log("\nEstado atual:");
  for (const row of check) {
    console.log(
      `  ${row.slug.padEnd(10)} cronograma=${row.scheduleEnabled ? "sim" : "não"}` +
        `  herda=${row.appsSource?.slug ?? "—"}` +
        `  aplicativos=${row._count.links}  posts=${row._count.posts}`,
    );
  }
  console.log("\nAbra /setores/vendas e /setores/marketing — a aba Cronograma deve aparecer.");
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    console.error(
      "\nSe o erro citar coluna inexistente (scheduleEnabled/appsSourceId), a migration ainda não foi aplicada:" +
        "\n  npx prisma migrate deploy && npx prisma generate",
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
