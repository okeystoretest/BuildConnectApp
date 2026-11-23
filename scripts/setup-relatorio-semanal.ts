/**
 * Build.Connect — habilita a ferramenta Relatório Semanal no Marketing.
 *
 * Faz duas coisas, idempotentes: liga `weeklyReportEnabled` no subsetor e
 * garante os 12 cartões com que o quadro Kanban abre (os da aba 7 da
 * planilha). Rodar duas vezes não duplica cartão — a chave é o `code`, único
 * por subsetor.
 *
 * NÃO segue a herança de `appsSourceId`: Marketing herda de Vendas os
 * aplicativos e o cronograma, mas o relatório é da área que o preenche. Para
 * habilitar em outra área, passe o slug.
 *
 * Não cria subsetor, não mexe em usuários, conteúdos ou avaliações. É o
 * caminho seguro para uma base já em uso, onde `prisma db seed` não deve ser
 * executado.
 *
 * Uso:
 *   npx tsx scripts/setup-relatorio-semanal.ts [slug]
 */

import { PrismaClient } from "@prisma/client";
import { TASKS } from "../src/lib/weekly-report/templates";

const prisma = new PrismaClient();
const slug = process.argv[2] ?? "marketing";

async function main() {
  console.log("Build.Connect — setup do Relatório Semanal\n");

  const sub = await prisma.subsector.findUnique({
    where: { slug },
    select: { id: true, label: true, weeklyReportEnabled: true },
  });
  if (!sub) {
    throw new Error(
      `Subsetor "${slug}" não encontrado. Rode \`npx prisma db seed\` antes — ele cria a estrutura base.`,
    );
  }

  if (!sub.weeklyReportEnabled) {
    await prisma.subsector.update({
      where: { id: sub.id },
      data: { weeklyReportEnabled: true },
    });
    console.log(`  ✓ Relatório Semanal habilitado em ${sub.label}`);
  } else {
    console.log(`  · Relatório Semanal já estava habilitado em ${sub.label}`);
  }

  // Os cartões do quadro. `skipDuplicates` não serve aqui: o código é gerado
  // pela posição, e conferir o que já existe é o que permite rodar o script
  // depois de alguém ter excluído um cartão sem ressuscitá-lo com outro nome.
  const existentes = await prisma.marketingTask.findMany({
    where: { subsectorId: sub.id },
    select: { code: true },
  });
  const jaTem = new Set(existentes.map((t) => t.code));

  let criados = 0;
  for (const [i, modelo] of TASKS.entries()) {
    const code = `K-${String(i + 1).padStart(2, "0")}`;
    if (jaTem.has(code)) continue;
    await prisma.marketingTask.create({
      data: {
        subsectorId: sub.id,
        code,
        title: modelo.title,
        category: modelo.category,
        priority: modelo.priority,
      },
    });
    criados += 1;
  }
  console.log(
    criados > 0
      ? `  ✓ ${criados} cartão(ões) criado(s) no quadro Kanban`
      : "  · Quadro Kanban já tinha os cartões",
  );

  // Conferência final — é isto que a aplicação lê para montar a aba.
  const check = await prisma.subsector.findUnique({
    where: { id: sub.id },
    select: {
      slug: true,
      weeklyReportEnabled: true,
      _count: { select: { weeklyReports: true, marketingTasks: true } },
    },
  });
  console.log(
    `\nEstado atual:\n  ${check?.slug}  relatório=${check?.weeklyReportEnabled ? "sim" : "não"}` +
      `  semanas=${check?._count.weeklyReports}  cartões=${check?._count.marketingTasks}`,
  );
  console.log(`\nAbra /setores/${slug} — a aba Relatório Semanal deve aparecer.`);
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    console.error(
      "\nSe o erro citar coluna inexistente (weeklyReportEnabled), a migration ainda não foi aplicada:" +
        "\n  npx prisma migrate deploy && npx prisma generate",
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
