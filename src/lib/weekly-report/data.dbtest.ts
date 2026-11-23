import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { requireApprover, requireWeeklyScope } from "./guards";
import { getWeeklyReportData, getWeeklyReportDetail, resolveWeeklyScope } from "./data";
import { AGENDA } from "./templates";

/**
 * O Relatório Semanal contra o Postgres.
 *
 * As actions não são chamadas aqui: elas começam por `getCurrentUser`, que lê
 * o cookie da requisição, e num teste de banco não existe requisição. O que É
 * testado é tudo que decide o resultado delas — as guardas de papel e de
 * escopo, o isolamento entre áreas, e a leitura com os números calculados
 * (contadores, média de 4 semanas). Mesma decisão do dbtest do Funil.
 */

const MARK = "#RELSEM";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let mktId = "";
let mktSlug = "";
let vendasSlug = "";
let semFerramentaSlug = "";
let outraAreaSlug = "";
let outraAreaId = "";
let colaborador = { id: "", role: "COLABORADOR" };
let gestor = { id: "", role: "GESTOR" };
let admin = { id: "", role: "ADMIN" };
let gestorDeFora = { id: "", role: "GESTOR" };
let semanaAtual = "";
let semanaAnterior = "";

/** O resultado-chave usado nos testes de média — casado pelo TEXTO. */
const KR_MENSAL = "Crescer base de seguidores";

/** Entregas de teste. Fixas AQUI, porque o relatório não as traz mais prontas. */
const ENTREGAS_DE_TESTE = [
  { day: "Segunda", block: "Planejamento", expected: "Calendário da semana fechado" },
  { day: "Terça", block: "Gravação", expected: "Conteúdos gravados com as consultoras" },
  { day: "Sexta", block: "Relatório", expected: "Relatório preenchido e enviado" },
];

/**
 * Cria uma semana como a action cria: só com a PAUTA pronta, mais as linhas
 * que o teste precisa. Desde 23/11/2026 entregas, métricas e OKRs nascem
 * vazios — a semana monta as próprias.
 */
async function criarSemana(
  subsectorId: string,
  weekNumber: number,
  periodStart: string,
  autorId: string,
) {
  const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const fim = new Date(Date.parse(`${periodStart}T00:00:00Z`) + 4 * 86_400_000);
  const row = await prisma.weeklyReport.create({
    data: {
      subsectorId,
      createdById: autorId,
      weekNumber,
      periodStart: dia(periodStart),
      periodEnd: fim,
      deliveries: { create: ENTREGAS_DE_TESTE.map((d, order) => ({ order, ...d })) },
      okrs: {
        create: [
          {
            order: 0,
            objective: "Crescimento e engajamento",
            keyResult: KR_MENSAL,
            measure: "Insights do perfil",
            goalLabel: "+3.000 seguidores",
            goalValue: 3000,
            monthlyRead: true,
          },
          {
            order: 1,
            objective: "Organização e processo",
            keyResult: "Documentar 1 processo novo",
            measure: "Pasta de processos",
            goalLabel: "1 por semana",
            goalValue: 1,
          },
        ],
      },
      agenda: { create: AGENDA.map((a, order) => ({ order, ...a })) },
    },
    select: { id: true },
  });
  return row.id;
}

before(async () => {
  const sector = await prisma.sector.create({
    data: { slug: `rs-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 997 },
    select: { id: true },
  });
  sectorId = sector.id;

  // Vendas de mentira: dona dos aplicativos, SEM relatório próprio.
  const vendas = await prisma.subsector.create({
    data: {
      slug: `rsvendas-${stamp()}`,
      label: `Vendas ${MARK}`,
      icon: "Tag",
      kind: "PADRAO",
      order: 1,
      sectorId,
    },
    select: { id: true, slug: true },
  });
  vendasSlug = vendas.slug;

  // Marketing: herda os aplicativos de Vendas e tem o relatório HABILITADO.
  // É esta combinação que prova que o relatório não segue a herança.
  const mkt = await prisma.subsector.create({
    data: {
      slug: `rsmkt-${stamp()}`,
      label: `Marketing ${MARK}`,
      icon: "Megaphone",
      kind: "PADRAO",
      order: 2,
      sectorId,
      appsSourceId: vendas.id,
      weeklyReportEnabled: true,
    },
    select: { id: true, slug: true },
  });
  mktId = mkt.id;
  mktSlug = mkt.slug;

  const semFerramenta = await prisma.subsector.create({
    data: {
      slug: `rssem-${stamp()}`,
      label: `Sem relatório ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 3,
      sectorId,
    },
    select: { slug: true },
  });
  semFerramentaSlug = semFerramenta.slug;

  // Segunda área COM a ferramenta, no mesmo setor: serve para provar que uma
  // não lê a semana da outra.
  const outraArea = await prisma.subsector.create({
    data: {
      slug: `rsoutra-${stamp()}`,
      label: `Outra área ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 4,
      sectorId,
      weeklyReportEnabled: true,
    },
    select: { id: true, slug: true },
  });
  outraAreaId = outraArea.id;
  outraAreaSlug = outraArea.slug;

  const outroSetor = await prisma.sector.create({
    data: { slug: `rsout-${stamp()}`, label: `Fora ${MARK}`, icon: "Box", order: 996 },
    select: { id: true },
  });

  const criarUsuario = async (role: "COLABORADOR" | "GESTOR" | "ADMIN", setor: string) => {
    const u = await prisma.user.create({
      data: {
        username: `rs-${role.toLowerCase()}-${stamp()}${MARK}`,
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

  semanaAnterior = await criarSemana(mktId, 46, "2026-11-09", colaborador.id);
  semanaAtual = await criarSemana(mktId, 47, "2026-11-16", colaborador.id);
});

after(async () => {
  await prisma.weeklyReport.deleteMany({ where: { subsector: { label: { contains: MARK } } } });
  await prisma.marketingTask.deleteMany({ where: { subsector: { label: { contains: MARK } } } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
  await prisma.subsector.deleteMany({ where: { label: { contains: MARK } } });
  await prisma.sector.deleteMany({ where: { label: { contains: MARK } } });
});

test("Colaborador não aprova; Gestor e Admin sim", () => {
  assert.match(requireApprover(colaborador).error ?? "", /Gestor ou Admin/);
  assert.equal(requireApprover(gestor).error, null);
  assert.equal(requireApprover(admin).error, null);
});

test("subsetor sem a ferramenta recusa a escrita", async () => {
  const { scope, error } = await requireWeeklyScope(semFerramentaSlug, gestor);
  assert.equal(scope, null);
  assert.match(error ?? "", /não está habilitado/);
});

test("Gestor de outro setor não alcança o escopo", async () => {
  const { scope, error } = await requireWeeklyScope(mktSlug, gestorDeFora);
  assert.equal(scope, null);
  assert.match(error ?? "", /não tem acesso/);
});

test("o relatório NÃO segue a herança de aplicativos", async () => {
  // Marketing herda os aplicativos de Vendas, mas é ele que tem o relatório:
  // o escopo resolve para o próprio Marketing, e Vendas não ganha a aba.
  const escopoMkt = await resolveWeeklyScope(mktSlug);
  assert.equal(escopoMkt?.slug, mktSlug);
  assert.equal(await resolveWeeklyScope(vendasSlug), null);
  assert.equal(await getWeeklyReportData(vendasSlug, "ADMIN"), null);
});

test("Colaborador preenche, mas não aprova", async () => {
  const comoColaborador = await getWeeklyReportData(mktSlug, "COLABORADOR");
  assert.equal(comoColaborador?.canEdit, true);
  assert.equal(comoColaborador?.canApprove, false);

  const comoGestor = await getWeeklyReportData(mktSlug, "GESTOR");
  assert.equal(comoGestor?.canApprove, true);
});

test("a lista traz as semanas da mais recente para a mais antiga", async () => {
  const data = await getWeeklyReportData(mktSlug, "GESTOR");
  assert.equal(data?.reports.length, 2);
  assert.equal(data?.reports[0]?.weekNumber, 47);
  assert.equal(data?.reports[1]?.weekNumber, 46);
});

test("o relatório nasce sem entregas, métricas e OKRs — só com a pauta", async () => {
  // A predefinição saiu em 23/11/2026. Quem monta a semana é a semana.
  const { id } = await prisma.weeklyReport.create({
    data: {
      subsectorId: mktId,
      weekNumber: 40,
      periodStart: new Date("2026-09-28T00:00:00Z"),
      periodEnd: new Date("2026-10-02T00:00:00Z"),
      agenda: { create: AGENDA.map((a, order) => ({ order, ...a })) },
    },
    select: { id: true },
  });

  const detalhe = await getWeeklyReportDetail(mktSlug, id, "GESTOR");
  assert.equal(detalhe?.deliveries.length, 0);
  assert.equal(detalhe?.metrics.length, 0);
  assert.equal(detalhe?.okrs.length, 0);
  assert.equal(detalhe?.agenda.length, AGENDA.length);

  // Sem entregas, não há pendência a cobrar — nem contador a inventar.
  assert.equal(detalhe?.pending, 0);
  assert.equal(detalhe?.onTrack, 0);

  await prisma.weeklyReport.delete({ where: { id } });
});

test("os contadores do card acompanham o que foi respondido", async () => {
  const detalhe = await getWeeklyReportDetail(mktSlug, semanaAtual, "GESTOR");
  const [a, b, c] = detalhe!.deliveries;
  await prisma.weeklyReportDelivery.update({
    where: { id: a!.id },
    data: { health: "NO_RITMO" },
  });
  await prisma.weeklyReportDelivery.update({
    where: { id: b!.id },
    data: { health: "ATENCAO" },
  });
  await prisma.weeklyReportDelivery.update({
    where: { id: c!.id },
    data: { health: "TRAVADO" },
  });

  const data = await getWeeklyReportData(mktSlug, "GESTOR");
  const semana = data?.reports.find((r) => r.id === semanaAtual);
  assert.equal(semana?.onTrack, 1);
  assert.equal(semana?.attention, 1);
  assert.equal(semana?.blocked, 1);
  assert.equal(semana?.pending, ENTREGAS_DE_TESTE.length - 3);
});

test("a semana de uma área não é alcançável pelo slug de outra", async () => {
  // O id existe, o usuário tem acesso ao setor, a ferramenta está ligada na
  // outra área — e ainda assim não abre. É o `subsectorId` no WHERE.
  const vazado = await getWeeklyReportDetail(outraAreaSlug, semanaAtual, "ADMIN");
  assert.equal(vazado, null);
});

test("a média de 4 semanas atravessa os relatórios, casando o KR pelo texto", async () => {
  const kr = KR_MENSAL;
  await prisma.weeklyReportOkr.updateMany({
    where: { reportId: semanaAnterior, keyResult: kr },
    data: { achieved: 200 },
  });
  await prisma.weeklyReportOkr.updateMany({
    where: { reportId: semanaAtual, keyResult: kr },
    data: { achieved: 400 },
  });

  const detalhe = await getWeeklyReportDetail(mktSlug, semanaAtual, "GESTOR");
  const linha = detalhe?.okrs.find((o) => o.keyResult === kr);
  assert.equal(linha?.monthlyRead, true);
  assert.equal(linha?.achieved, 400);
  // Duas semanas apuradas dividem por DUAS, não por quatro.
  assert.equal(linha?.fourWeekAverage, 300);

  // A semana anterior não vê a seguinte: a média é retrospectiva.
  const anterior = await getWeeklyReportDetail(mktSlug, semanaAnterior, "GESTOR");
  assert.equal(anterior?.okrs.find((o) => o.keyResult === kr)?.fourWeekAverage, 200);
});

test("KR sem nenhuma semana apurada não tem média", async () => {
  const detalhe = await getWeeklyReportDetail(mktSlug, semanaAtual, "GESTOR");
  const semApuracao = detalhe?.okrs.find((o) => o.achieved === undefined);
  assert.ok(semApuracao, "esperava um KR não apurado");
  assert.equal(semApuracao?.fourWeekAverage, undefined);
});

test("relatório aprovado fecha para quem preenche e segue aberto para quem aprova", async () => {
  await prisma.weeklyReport.update({
    where: { id: semanaAnterior },
    data: { status: "APROVADO", approvedAt: new Date(), approvedById: gestor.id },
  });

  const paraColaborador = await getWeeklyReportDetail(mktSlug, semanaAnterior, "COLABORADOR");
  assert.equal(paraColaborador?.canEdit, false);

  const paraGestor = await getWeeklyReportDetail(mktSlug, semanaAnterior, "GESTOR");
  assert.equal(paraGestor?.canEdit, true);
});

test("o quadro Kanban é da área, e o painel conta o que está nele", async () => {
  await prisma.marketingTask.createMany({
    data: [
      { subsectorId: mktId, code: "K-01", title: `Gravar ${MARK}`, category: "CONTEUDO", priority: "ALTA" },
      { subsectorId: mktId, code: "K-02", title: `Agendar ${MARK}`, category: "PUBLICACAO", priority: "ALTA", status: "PUBLICADO", evidence: "link" },
      // Prazo vencido e não publicado: o SUMPRODUCT da aba 8.
      { subsectorId: mktId, code: "K-03", title: `Atrasada ${MARK}`, category: "PROCESSO", priority: "BAIXA", dueDate: new Date("2020-01-01T00:00:00Z") },
      // Na outra área: não pode aparecer no painel do Marketing.
      { subsectorId: outraAreaId, code: "K-01", title: `De fora ${MARK}`, category: "CONTEUDO", priority: "ALTA" },
    ],
  });

  const data = await getWeeklyReportData(mktSlug, "GESTOR");
  assert.equal(data?.summary.total, 3);
  assert.equal(data?.summary.published, 1);
  assert.equal(data?.summary.overdue, 1);
  assert.equal(data?.tasks.find((t) => t.code === "K-03")?.overdue, true);

  // O mesmo código em duas áreas convive — a unicidade é por subsetor.
  const outra = await getWeeklyReportData(outraAreaSlug, "GESTOR");
  assert.equal(outra?.summary.total, 1);
});
