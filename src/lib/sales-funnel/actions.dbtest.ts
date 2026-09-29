import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { requireFunnelManager, requireFunnelScope } from "./guards";
import { gravarCenario, substituirCanais, substituirEtapas } from "./core";
import { getSalesFunnelData, getSalesFunnelDetail, centavosParaDecimal } from "./data";

/**
 * O Funil de Vendas contra o Postgres.
 *
 * As actions em si não são chamadas aqui: elas começam por `getCurrentUser`,
 * que lê o cookie da requisição, e num teste de banco não existe requisição.
 * O que É testado é tudo que decide o resultado delas — as guardas de papel e
 * de escopo, a substituição de etapas em transação, e a leitura pela base
 * compartilhada. Ver o ledger da Task 8 para o registro da decisão.
 */

const MARK = "#FUNIL";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let vendasId = "";
let vendasSlug = "";
let marketingSlug = "";
let semFunilSlug = "";
let outroSetorSlug = "";
let colaborador = { id: "", role: "COLABORADOR" };
let gestor = { id: "", role: "GESTOR" };
let admin = { id: "", role: "ADMIN" };
let gestorDeFora = { id: "", role: "GESTOR" };
let funnelId = "";

before(async () => {
  const sector = await prisma.sector.create({
    data: { slug: `fn-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = sector.id;

  // Vendas de mentira: dono da base, com a ferramenta ligada.
  const vendas = await prisma.subsector.create({
    data: {
      slug: `fnvendas-${stamp()}`,
      label: `Vendas ${MARK}`,
      icon: "Tag",
      kind: "PADRAO",
      order: 1,
      sectorId,
      funnelEnabled: true,
    },
    select: { id: true, slug: true },
  });
  vendasId = vendas.id;
  vendasSlug = vendas.slug;

  // Marketing de mentira: herda a base de Vendas, sem flag própria.
  const marketing = await prisma.subsector.create({
    data: {
      slug: `fnmkt-${stamp()}`,
      label: `Marketing ${MARK}`,
      icon: "Megaphone",
      kind: "PADRAO",
      order: 2,
      sectorId,
      appsSourceId: vendasId,
    },
    select: { slug: true },
  });
  marketingSlug = marketing.slug;

  // Subsetor sem a ferramenta, no MESMO setor.
  const semFunil = await prisma.subsector.create({
    data: {
      slug: `fnsem-${stamp()}`,
      label: `Sem funil ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 3,
      sectorId,
    },
    select: { slug: true },
  });
  semFunilSlug = semFunil.slug;

  // Setor inteiramente separado, para o gestor de fora.
  const outroSetor = await prisma.sector.create({
    data: { slug: `fnout-${stamp()}`, label: `Outro ${MARK}`, icon: "Box", order: 998 },
    select: { id: true },
  });
  const outroSub = await prisma.subsector.create({
    data: {
      slug: `fnoutsub-${stamp()}`,
      label: `Outro sub ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 1,
      sectorId: outroSetor.id,
    },
    select: { slug: true },
  });
  outroSetorSlug = outroSub.slug;

  const criarUsuario = async (role: "COLABORADOR" | "GESTOR" | "ADMIN", setor: string) => {
    const u = await prisma.user.create({
      data: {
        username: `fn-${role.toLowerCase()}-${stamp()}${MARK}`,
        fullName: `${role} ${MARK}`,
        passwordHash: "x",
        role,
        sectorId: setor,
      },
      select: { id: true },
    });
    return { id: u.id, role };
  };
  colaborador = await criarUsuario("COLABORADOR", sectorId);
  gestor = await criarUsuario("GESTOR", sectorId);
  admin = await criarUsuario("ADMIN", sectorId);
  gestorDeFora = await criarUsuario("GESTOR", outroSetor.id);

  const funil = await prisma.salesFunnel.create({
    data: {
      name: `Varejo ${MARK}`,
      referenceDate: new Date("2026-10-01T12:00:00"),
      goalAmount: centavosParaDecimal(5_000_000),
      averageTicket: centavosParaDecimal(100_000),
      subsectorId: vendasId,
      createdById: gestor.id,
      stages: {
        create: [
          { order: 0, label: "Oportunidades", conversionRate: 50 },
          { order: 1, label: "Visita", conversionRate: 50 },
          { order: 2, label: "Proposta", conversionRate: 20 },
        ],
      },
    },
    select: { id: true },
  });
  funnelId = funil.id;
});

after(async () => {
  await prisma.salesFunnel.deleteMany({ where: { name: { contains: MARK } } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
  await prisma.subsector.deleteMany({ where: { label: { contains: MARK } } });
  await prisma.sector.deleteMany({ where: { label: { contains: MARK } } });
});

test("Colaborador não gerencia funil; Gestor e Admin sim", () => {
  assert.match(requireFunnelManager(colaborador).error ?? "", /Gestor ou Admin/);
  assert.equal(requireFunnelManager(gestor).error, null);
  assert.equal(requireFunnelManager(admin).error, null);
});

test("subsetor sem funnelEnabled recusa a escrita", async () => {
  const { scope, error } = await requireFunnelScope(semFunilSlug, gestor);
  assert.equal(scope, null);
  assert.match(error ?? "", /não está habilitado/);
});

test("Gestor de outro setor não alcança o escopo de Vendas", async () => {
  const { scope, error } = await requireFunnelScope(vendasSlug, gestorDeFora);
  assert.equal(scope, null);
  assert.match(error ?? "", /não tem acesso/);
});

test("Marketing resolve para a base de Vendas, com a ferramenta herdada", async () => {
  const { scope, error } = await requireFunnelScope(marketingSlug, gestor);
  assert.equal(error, null);
  assert.equal(scope?.id, vendasId);
  assert.equal(scope?.inherited, true);
  assert.equal(scope?.funnelEnabled, true);
});

test("funil criado em Vendas aparece na leitura de Marketing, já calculado", async () => {
  const dados = await getSalesFunnelData(marketingSlug, "GESTOR");
  assert.equal(dados?.inherited, true);
  assert.equal(dados?.scopeSlug, vendasSlug);
  const encontrado = dados?.funnels.find((f) => f.id === funnelId);
  assert.equal(encontrado?.requiredConversions, 50);
  assert.equal(encontrado?.topVolume, 1000);
});

test("canManage reflete o papel de quem lê, não o dono do funil", async () => {
  const comoGestor = await getSalesFunnelData(vendasSlug, "GESTOR");
  const comoColaborador = await getSalesFunnelData(vendasSlug, "COLABORADOR");
  assert.equal(comoGestor?.canManage, true);
  assert.equal(comoColaborador?.canManage, false);
});

test("o detalhe não entrega funil de um escopo que não é o pedido", async () => {
  const fora = await getSalesFunnelDetail(outroSetorSlug, funnelId);
  assert.equal(fora, null);
});

test("substituir etapas troca a lista inteira, sem ordem duplicada nem buraco", async () => {
  await substituirEtapas(funnelId, [
    { label: "Lead", rate: 30 },
    { label: "Reunião", rate: 60 },
    { label: "Proposta", rate: 25 },
    { label: "Negociação", rate: 40 },
  ]);
  const etapas = await prisma.salesFunnelStage.findMany({
    where: { funnelId },
    orderBy: { order: "asc" },
    select: { order: true, label: true },
  });
  assert.deepEqual(
    etapas.map((e) => e.order),
    [0, 1, 2, 3],
  );
  assert.equal(etapas[0]?.label, "Lead");
});

test("trocar as etapas apaga as taxas de cenário que apontavam para elas", async () => {
  const etapas = await prisma.salesFunnelStage.findMany({
    where: { funnelId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const ultima = etapas[etapas.length - 1];
  assert.ok(ultima);

  const cenario = await prisma.salesFunnelScenario.create({
    data: {
      funnelId,
      name: `Cenário ${MARK}`,
      ticketPercent: 10,
      rates: { create: [{ stageId: ultima.id, conversionRate: 25 }] },
    },
    select: { id: true },
  });
  assert.equal(await prisma.salesFunnelScenarioRate.count({ where: { scenarioId: cenario.id } }), 1);

  await substituirEtapas(funnelId, [
    { label: "A", rate: 50 },
    { label: "B", rate: 50 },
    { label: "C", rate: 20 },
  ]);

  // O cenário sobrevive; a taxa órfã, não.
  assert.equal(await prisma.salesFunnelScenario.count({ where: { id: cenario.id } }), 1);
  assert.equal(await prisma.salesFunnelScenarioRate.count({ where: { scenarioId: cenario.id } }), 0);
});

test("substituir canais troca a lista inteira e reatribui a ordem", async () => {
  await substituirCanais(funnelId, [
    { label: "Base de clientes", share: 40, strategy: "Ligação mensal" },
    { label: "Indicações", share: 60 },
  ]);
  const canais = await prisma.salesFunnelChannel.findMany({
    where: { funnelId },
    orderBy: { order: "asc" },
    select: { order: true, label: true, strategy: true, share: true },
  });
  assert.deepEqual(
    canais.map((c) => c.order),
    [0, 1],
  );
  assert.equal(canais[0]?.label, "Base de clientes");
  assert.equal(canais[0]?.strategy, "Ligação mensal");
  assert.equal(canais[1]?.strategy, null);

  // Substituir de novo não acumula nem deixa buraco na ordem.
  await substituirCanais(funnelId, [{ label: "Só um", share: 100 }]);
  const depois = await prisma.salesFunnelChannel.findMany({ where: { funnelId } });
  assert.equal(depois.length, 1);
  assert.equal(depois[0]?.order, 0);
});

test("o detalhe devolve os canais já traduzidos em prospecções", async () => {
  await substituirEtapas(funnelId, [
    { label: "Oportunidades", rate: 50 },
    { label: "Visita", rate: 50 },
    { label: "Proposta", rate: 20 },
  ]);
  await substituirCanais(funnelId, [
    { label: "A", share: 40 },
    { label: "B", share: 60 },
  ]);
  const detalhe = await getSalesFunnelDetail(vendasSlug, funnelId);
  assert.equal(detalhe?.topVolume, 1000);
  assert.deepEqual(
    detalhe?.channels.map((c) => c.share),
    [40, 60],
  );
});

test("o cenário guarda só as taxas que muda, e ignora etapa de outro funil", async () => {
  const etapas = await prisma.salesFunnelStage.findMany({
    where: { funnelId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const ultima = etapas[etapas.length - 1];
  assert.ok(ultima);

  const id = await gravarCenario({
    funnelId,
    name: `+10% no ticket ${MARK}`,
    ticketPercent: 10,
    topPercent: 0,
    rates: [
      { stageId: ultima.id, rate: 25 },
      // Etapa que não é deste funil: tem de ser descartada, não gravada.
      { stageId: "etapa-de-outro-funil", rate: 99 },
    ],
    createdById: gestor.id,
  });
  assert.ok(id);

  const taxas = await prisma.salesFunnelScenarioRate.findMany({ where: { scenarioId: id } });
  assert.equal(taxas.length, 1);
  assert.equal(taxas[0]?.stageId, ultima.id);
  assert.equal(taxas[0]?.conversionRate, 25);
});

test("gravar o mesmo cenário de novo substitui as taxas em vez de acumular", async () => {
  const etapas = await prisma.salesFunnelStage.findMany({
    where: { funnelId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const primeira = etapas[0];
  assert.ok(primeira);

  const id = await gravarCenario({
    funnelId,
    name: `Reescrito ${MARK}`,
    ticketPercent: 0,
    topPercent: 0,
    rates: [{ stageId: primeira.id, rate: 70 }],
    createdById: gestor.id,
  });
  assert.ok(id);

  await gravarCenario({
    scenarioId: id,
    funnelId,
    name: `Reescrito ${MARK}`,
    ticketPercent: 5,
    topPercent: 0,
    rates: [{ stageId: primeira.id, rate: 80 }],
    createdById: gestor.id,
  });

  const taxas = await prisma.salesFunnelScenarioRate.findMany({ where: { scenarioId: id } });
  assert.equal(taxas.length, 1);
  assert.equal(taxas[0]?.conversionRate, 80);
  const cenario = await prisma.salesFunnelScenario.findUniqueOrThrow({ where: { id } });
  assert.equal(cenario.ticketPercent, 5);
});

test("o detalhe devolve o cenário com as taxas indexadas por etapa", async () => {
  const detalhe = await getSalesFunnelDetail(vendasSlug, funnelId);
  const cenario = detalhe?.scenarios.find((c) => c.name.includes("+10% no ticket"));
  assert.ok(cenario);
  assert.equal(cenario.ticketPercent, 10);
  assert.equal(Object.keys(cenario.rates).length, 1);
});
