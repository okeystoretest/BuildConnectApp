/**
 * Build.Connect — cadastra as perguntas da AVALIAÇÃO MULTIDIRECIONAL DE
 * INTELIGÊNCIA EMOCIONAL (Quociente Emocional).
 *
 * Escopo cirúrgico: mexe SÓ no instrumento `inteligencia-emocional`. Não toca
 * em usuários (portanto não precisa de SEED_PASSWORD e não reseta senha
 * nenhuma), nem nos outros instrumentos.
 *
 * Uso, na VPS, dentro do container do app:
 *   npx tsx scripts/seed-inteligencia-emocional.ts
 *
 * Proteção: se o instrumento já tiver respostas gravadas, o script NÃO recria
 * as perguntas (EvaluationAnswer.question é onDelete: Cascade — recriar
 * apagaria as respostas). Nesse caso ele avisa e sai sem alterar nada.
 */

import { PrismaClient } from "@prisma/client";
import { EVALUATION_CATALOG } from "../src/lib/evaluation-catalog";

const prisma = new PrismaClient();
const SLUG = "inteligencia-emocional";

async function main() {
  const definition = EVALUATION_CATALOG.find((t) => t.slug === SLUG);
  if (!definition) {
    throw new Error(`Instrumento "${SLUG}" não está no catálogo.`);
  }

  console.log(`Inteligência Emocional — cadastro de perguntas\n`);

  const type = await prisma.evaluationType.upsert({
    where: { slug: SLUG },
    update: {
      kind: definition.kind,
      title: definition.title,
      description: definition.description ?? null,
      scaleMax: definition.scaleMax,
      scaleLabels: definition.scaleLabels ?? [],
      hasCycle: definition.hasCycle,
      order: definition.order,
    },
    create: {
      slug: SLUG,
      kind: definition.kind,
      title: definition.title,
      description: definition.description ?? null,
      scaleMax: definition.scaleMax,
      scaleLabels: definition.scaleLabels ?? [],
      hasCycle: definition.hasCycle,
      order: definition.order,
    },
  });

  const answers = await prisma.evaluationAnswer.count({
    where: { question: { section: { typeId: type.id } } },
  });
  if (answers > 0) {
    console.log(
      `  ! ${answers} resposta(s) já gravada(s). As perguntas foram PRESERVADAS.\n` +
        `    Para trocá-las, rode antes: npx tsx scripts/reset-evaluations.ts`,
    );
    return;
  }

  // Ordem das seções: 0 = Pessoais, 1 = Sociais (mesma ordem do formulário).
  await prisma.$transaction(async (tx) => {
    await tx.evaluationSection.deleteMany({ where: { typeId: type.id } });

    let sOrder = 0;
    for (const section of definition.sections) {
      const created = await tx.evaluationSection.create({
        data: { typeId: type.id, title: section.title, order: sOrder },
      });
      let qOrder = 0;
      for (const question of section.questions) {
        await tx.evaluationQuestion.create({
          data: {
            sectionId: created.id,
            label: question.label,
            helpText: question.helpText ?? null,
            order: qOrder,
          },
        });
        qOrder += 1;
      }
      console.log(`  ✓ ${section.title} — ${section.questions.length} critérios`);
      sOrder += 1;
    }
  });

  const total = definition.sections.reduce((n, s) => n + s.questions.length, 0);
  console.log(`\nPronto: escala 1–${definition.scaleMax}, ${total} critérios em ${definition.sections.length} blocos.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
