/**
 * Build.Connect — RESET da estrutura de Avaliações (via Prisma).
 *
 * Apaga TODOS os dados de avaliação para re-semear do zero, sem tocar em
 * usuários, setores, chamados, conteúdos ou mapas. Roda numa transação:
 * ou apaga tudo, ou nada.
 *
 * Uso:
 *   npx tsx scripts/reset-evaluations.ts
 *   (ou)  npx ts-node scripts/reset-evaluations.ts
 *
 * Depois:
 *   npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Reset de Avaliações — Build.Connect\n");

  const result = await prisma.$transaction(async (tx) => {
    // Ordem respeitando as FKs (folhas primeiro).
    const answers = await tx.evaluationAnswer.deleteMany({});
    const evaluations = await tx.evaluation.deleteMany({});
    const cycles = await tx.evaluationCycle.deleteMany({});
    const questions = await tx.evaluationQuestion.deleteMany({});
    const sections = await tx.evaluationSection.deleteMany({});
    const types = await tx.evaluationType.deleteMany({});

    // Notificações de avaliação (a leitura primeiro, por causa da FK).
    const notifIds = await tx.notification.findMany({
      where: { kind: "AVALIACAO" },
      select: { id: true },
    });
    const ids = notifIds.map((n) => n.id);
    let reads = { count: 0 };
    let notifications = { count: 0 };
    if (ids.length > 0) {
      reads = await tx.notificationRead.deleteMany({
        where: { notificationId: { in: ids } },
      });
      notifications = await tx.notification.deleteMany({
        where: { id: { in: ids } },
      });
    }

    return {
      answers: answers.count,
      evaluations: evaluations.count,
      cycles: cycles.count,
      questions: questions.count,
      sections: sections.count,
      types: types.count,
      notifications: notifications.count,
      notificationReads: reads.count,
    };
  });

  console.log("  ✓ EvaluationAnswer      :", result.answers);
  console.log("  ✓ Evaluation            :", result.evaluations);
  console.log("  ✓ EvaluationCycle       :", result.cycles);
  console.log("  ✓ EvaluationQuestion    :", result.questions);
  console.log("  ✓ EvaluationSection     :", result.sections);
  console.log("  ✓ EvaluationType        :", result.types);
  console.log("  ✓ Notification (AVALIACAO):", result.notifications);
  console.log("  ✓ NotificationRead      :", result.notificationReads);
  console.log('\nConcluído. Agora rode: npx prisma db seed');
}

main()
  .catch((e) => {
    console.error("Falha no reset:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
