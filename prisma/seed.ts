import { PrismaClient, Role, SectorKind } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SECTOR_GROUPS, STANDALONE_SECTORS } from "../src/lib/navigation";
import { UNIT_RECORDS } from "../src/lib/units";
import { EVALUATION_CATALOG } from "../src/lib/evaluation-catalog";

const prisma = new PrismaClient();

/**
 * Senha inicial de todos os usuários criados pelo seed.
 *
 * Em desenvolvimento cai no valor padrão. Na VPS, defina SEED_PASSWORD no
 * ambiente antes de rodar o seed — o seed é a origem do usuário admin, e um
 * admin com "senha123" numa aplicação exposta na internet é uma porta aberta.
 */
const SEED_PASSWORD = process.env.SEED_PASSWORD?.trim() || "senha123";

if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD?.trim()) {
  throw new Error(
    "SEED_PASSWORD não definida. Em produção, defina uma senha forte antes de rodar o seed:\n" +
      '  SEED_PASSWORD="..." npx prisma db seed',
  );
}

// Subsetores tratados como vitrine (galeria de fotos).
const VITRINE_SLUGS = new Set(["okey-vitrine", "lov-club-vitrine"]);

function slugFromHref(href: string): string {
  return href.replace("/setores/", "");
}

/**
 * Setores renomeados mantêm o slug original — é a chave das rotas dedicadas
 * (/setores/ti, /setores/rh), do RBAC e dos vínculos já gravados.
 */
const SECTOR_SLUG_OVERRIDES: Record<string, string> = {
  Retaguarda: "ti",
  DHO: "rh",
};

function sectorSlug(label: string): string {
  return SECTOR_SLUG_OVERRIDES[label] ?? slugify(label);
}

// Instrumentos de avaliação: fonte da verdade em src/lib/evaluation-catalog.ts.

// Vínculo dos usuários por rótulos (resolvidos para FK durante o seed).
const users = [
  {
    username: "ana#BC",
    fullName: "Ana Ribeiro",
    role: Role.COLABORADOR,
    sectorLabel: "Logística",
    subsectorLabels: ["Estoque"],
    unitLabel: "Unidade 1",
  },
  {
    username: "carlos#BC",
    fullName: "Carlos Mendes",
    role: Role.GESTOR,
    sectorLabel: "Comercial",
    subsectorLabels: ["Vendas"],
    unitLabel: "OKEY Store (Iguatemi)",
  },
  {
    username: "beatriz#BC",
    fullName: "Beatriz Souza",
    role: Role.ADMIN,
    sectorLabel: "Retaguarda",
    subsectorLabels: [],
    unitLabel: "Unidade 1",
  },
  {
    username: "pedro#BC",
    fullName: "Pedro Dias",
    role: Role.COLABORADOR,
    sectorLabel: "Logística",
    subsectorLabels: ["Motoristas"],
    unitLabel: "Unidade 2",
  },
];

async function seedUnits() {
  for (const unit of UNIT_RECORDS) {
    await prisma.unit.upsert({
      where: { label: unit.label },
      update: {},
      create: {
        label: unit.label,
        street: unit.address?.street ?? null,
        number: unit.address?.number ?? null,
        district: unit.address?.district ?? null,
        city: unit.address?.city ?? null,
        state: unit.address?.state ?? null,
        complement: unit.address?.complement ?? null,
      },
    });
  }
  console.log(`  ✓ ${UNIT_RECORDS.length} unidades`);
}

async function seedSectors() {
  // Setores com subsetores reais (Comercial, Produção, Logística).
  let sectorOrder = 0;
  for (const group of SECTOR_GROUPS) {
    const slug = sectorSlug(group.label);
    const sector = await prisma.sector.upsert({
      where: { slug },
      update: { label: group.label, icon: group.icon, order: sectorOrder },
      create: { slug, label: group.label, icon: group.icon, order: sectorOrder },
    });
    let subOrder = 0;
    for (const item of group.items) {
      const slug = slugFromHref(item.href);
      await prisma.subsector.upsert({
        where: { slug },
        update: { label: item.label, icon: item.icon, order: subOrder, sectorId: sector.id },
        create: {
          slug,
          label: item.label,
          icon: item.icon,
          kind: VITRINE_SLUGS.has(slug) ? SectorKind.VITRINE : SectorKind.PADRAO,
          order: subOrder,
          sectorId: sector.id,
        },
      });
      subOrder += 1;
    }
    sectorOrder += 1;
  }

  // Setores standalone (Retaguarda, DHO): 1 subsetor homônimo.
  for (const group of STANDALONE_SECTORS) {
    const sector = await prisma.sector.upsert({
      where: { slug: sectorSlug(group.label) },
      update: { label: group.label, icon: group.icon, order: sectorOrder },
      create: {
        slug: sectorSlug(group.label),
        label: group.label,
        icon: group.icon,
        order: sectorOrder,
      },
    });
    const item = group.items[0];
    if (!item) continue;
    const slug = slugFromHref(item.href);
    await prisma.subsector.upsert({
      where: { slug },
      update: { label: item.label, icon: item.icon, order: 0, sectorId: sector.id },
      create: { slug, label: item.label, icon: item.icon, order: 0, sectorId: sector.id },
    });
    sectorOrder += 1;
  }
  console.log(`  ✓ setores e subsetores`);
}

/**
 * Reestruturação organizacional: Compras e Financeiro deixaram de ser
 * setores próprios e passaram a subsetores de Administrativo. Os usuários
 * vinculados aos setores antigos são realocados antes da remoção — só então
 * o setor vazio é apagado, para nunca perder o vínculo do colaborador.
 */
async function migrateLegacySectors() {
  const administrativo = await prisma.sector.findUnique({
    where: { slug: "administrativo" },
    select: { id: true },
  });
  if (!administrativo) return;

  for (const legacySlug of ["compras", "financeiro"]) {
    const legacy = await prisma.sector.findUnique({
      where: { slug: legacySlug },
      select: { id: true, _count: { select: { subsectors: true } } },
    });
    if (!legacy || legacy._count.subsectors > 0) continue;

    await prisma.$transaction([
      prisma.user.updateMany({
        where: { sectorId: legacy.id },
        data: { sectorId: administrativo.id },
      }),
      prisma.sector.delete({ where: { id: legacy.id } }),
    ]);
    console.log(`  ✓ setor "${legacySlug}" migrado para Administrativo`);
  }
}

/**
 * Herança de aplicativos e ferramenta Cronograma.
 *
 * Marketing não tem base própria: aponta para Vendas e passa a listar os
 * mesmos aplicativos e a mesma agenda. O Cronograma é habilitado na origem —
 * quem herda recebe junto, sem duplicar configuração.
 */
async function seedAppInheritance() {
  const vendas = await prisma.subsector.findUnique({
    where: { slug: "vendas" },
    select: { id: true },
  });
  if (!vendas) return;

  await prisma.subsector.update({
    where: { id: vendas.id },
    data: { scheduleEnabled: true, appsSourceId: null },
  });

  const marketing = await prisma.subsector.findUnique({
    where: { slug: "marketing" },
    select: { id: true },
  });
  if (marketing) {
    await prisma.subsector.update({
      where: { id: marketing.id },
      data: { appsSourceId: vendas.id, scheduleEnabled: true },
    });
    console.log("  ✓ Marketing herda os aplicativos e o cronograma de Vendas");
  }

  await seedDemoSchedule(vendas.id);
}

/** Conteúdo de exemplo do Cronograma — só fora de produção e só se vazio. */
async function seedDemoSchedule(subsectorId: string) {
  if (process.env.NODE_ENV === "production") return;

  const existing = await prisma.contentPost.count({ where: { subsectorId } });
  if (existing > 0) return;

  const owner = await prisma.user.findFirst({
    where: { active: true },
    select: { id: true },
    orderBy: { fullName: "asc" },
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const at = (day: number, time: string) => new Date(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}:00.000Z`);

  await prisma.contentPost.createMany({
    data: [
      { subsectorId, ownerId: owner?.id ?? null, title: "Time to Okey Girls", scheduledAt: at(2, "10:00"), funnel: "MOFU" as const, format: "STORY" as const, status: "EM_PRODUCAO" as const },
      { subsectorId, ownerId: owner?.id ?? null, title: "Lançamento LOVCLUB", scheduledAt: at(3, "09:00"), funnel: "TOFU" as const, format: "REEL" as const, status: "AGENDADO" as const },
      { subsectorId, ownerId: owner?.id ?? null, title: "Spoiler + Prova Social", scheduledAt: at(4, "18:00"), funnel: "MOFU" as const, format: "STORY" as const, status: "IDEIA" as const },
      { subsectorId, ownerId: owner?.id ?? null, title: "Lançamento Okey + Oferta", scheduledAt: at(5, "11:00"), funnel: "BOFU" as const, format: "REEL_FEED" as const, status: "AGENDADO" as const },
      { subsectorId, ownerId: owner?.id ?? null, title: "Live de Lançamento", scheduledAt: at(6, "20:00"), funnel: "BOFU" as const, format: "LIVE" as const, status: "IDEIA" as const },
      { subsectorId, ownerId: owner?.id ?? null, title: "Bastidores da Coleção", scheduledAt: at(9, "15:00"), funnel: "TOFU" as const, format: "CARROSSEL" as const, status: "IDEIA" as const },
    ],
  });
  console.log("  ✓ cronograma de exemplo (somente desenvolvimento)");
}

async function seedEvaluationTypes() {
  for (const t of EVALUATION_CATALOG) {
    const type = await prisma.evaluationType.upsert({
      where: { slug: t.slug },
      update: {
        kind: t.kind,
        title: t.title,
        description: t.description ?? null,
        scaleMax: t.scaleMax,
        scaleLabels: t.scaleLabels ?? [],
        hasCycle: t.hasCycle,
        order: t.order,
      },
      create: {
        slug: t.slug,
        kind: t.kind,
        title: t.title,
        description: t.description ?? null,
        scaleMax: t.scaleMax,
        scaleLabels: t.scaleLabels ?? [],
        hasCycle: t.hasCycle,
        order: t.order,
      },
    });

    // Reconstrói seções/perguntas de forma idempotente (apaga e recria).
    await prisma.evaluationSection.deleteMany({ where: { typeId: type.id } });
    let sOrder = 0;
    for (const section of t.sections) {
      const createdSection = await prisma.evaluationSection.create({
        data: { typeId: type.id, title: section.title, order: sOrder },
      });
      sOrder += 1;
      let qOrder = 0;
      for (const q of section.questions) {
        await prisma.evaluationQuestion.create({
          data: {
            sectionId: createdSection.id,
            label: q.label,
            helpText: q.helpText ?? null,
            order: qOrder,
          },
        });
        qOrder += 1;
      }
    }
  }
  console.log(`  ✓ ${EVALUATION_CATALOG.length} instrumentos de avaliação (com perguntas)`);
}

async function seedUsers(passwordHash: string) {
  for (const u of users) {
    const sector = await prisma.sector.findUnique({ where: { slug: sectorSlug(u.sectorLabel) } });
    const unit = await prisma.unit.findUnique({ where: { label: u.unitLabel } });

    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        fullName: u.fullName,
        role: u.role,
        sectorId: sector?.id ?? null,
        unitId: unit?.id ?? null,
      },
      create: {
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        passwordHash,
        sectorId: sector?.id ?? null,
        unitId: unit?.id ?? null,
      },
    });

    // Reconstrói vínculos de subsetor.
    await prisma.userSubsector.deleteMany({ where: { userId: user.id } });
    for (const label of u.subsectorLabels) {
      const sub = await prisma.subsector.findFirst({ where: { label } });
      if (sub) {
        await prisma.userSubsector.create({
          data: { userId: user.id, subsectorId: sub.id },
        });
      }
    }
    console.log(`  ✓ ${u.username} (${u.role})`);
  }
}

async function seedEvaluationCycles() {
  const preEfetivo = await prisma.evaluationType.findFirst({ where: { kind: "PRE_EFETIVO" } });
  if (!preEfetivo) return;

  const { addBusinessDays } = await import("../src/lib/business-days");
  const collaborators = await prisma.user.findMany({
    where: { role: "COLABORADOR", active: true },
    select: { id: true, createdAt: true },
  });

  let count = 0;
  for (const u of collaborators) {
    const existing = await prisma.evaluationCycle.count({
      where: { subjectId: u.id, typeId: preEfetivo.id },
    });
    if (existing > 0) continue;

    const c1 = addBusinessDays(u.createdAt, 7);
    const c2 = addBusinessDays(c1, 7);
    const c3 = addBusinessDays(c2, 7);
    const dates = [c1, c2, c3];

    await prisma.evaluationCycle.createMany({
      data: [1, 2, 3].map((cycle) => ({
        typeId: preEfetivo.id,
        subjectId: u.id,
        cycle,
        status: "AGENDADO" as const,
        availableAt: dates[cycle - 1]!,
      })),
      skipDuplicates: true,
    });
    count += 1;
  }
  console.log(`  ✓ agenda de ciclos para ${count} colaborador(es)`);
}

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  console.log("Seed Build.Connect\n");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  await seedUnits();
  await seedSectors();
  await migrateLegacySectors();
  await seedEvaluationTypes();
  await seedUsers(passwordHash);
  await seedAppInheritance();
  await seedEvaluationCycles();
  console.log(`\nSeed concluído. Senha de todos: "${SEED_PASSWORD}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
