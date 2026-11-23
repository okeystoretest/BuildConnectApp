/**
 * Build.Connect — uma semana de EXEMPLO no Relatório Semanal, preenchida.
 *
 * Serve para olhar a ferramenta cheia: o card com a barra e o destaque, a
 * leitura com as seis abas, e os números que a tela calcula sozinha
 * (variação, % da meta, média de 4 semanas).
 *
 * Cria SETE semanas no subsetor que tem o relatório habilitado:
 *
 *   · 30/11 a 04/12/2026 — a semana cheia, com os seis blocos preenchidos.
 *   · 16 a 20/11/2026 — enxuta, só com os OKRs apurados. Existe para a média
 *     de 4 semanas ter de onde sair: ela é retrospectiva, e com uma semana só
 *     a coluna mostraria "—".
 *   · outubro e novembro — cinco semanas curtas (41 a 46), com destaque e uma
 *     ou duas entregas. São elas que levam a lista acima das seis por página,
 *     que é onde a paginação passa a existir.
 *
 * É DADO DE DEMONSTRAÇÃO. Para tirar tudo:
 *
 *   npx tsx scripts/semana-exemplo.ts --limpar
 *
 * Uso:
 *   npx tsx scripts/semana-exemplo.ts [slug]
 */

import { PrismaClient } from "@prisma/client";
import { AGENDA } from "../src/lib/weekly-report/templates";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--")) ?? "marketing";
const limpar = args.includes("--limpar");

/** Meia-noite UTC — a coluna é `@db.Date`, sem hora e sem fuso. */
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const SEMANA_ANTERIOR = "2026-11-16";
const SEMANA_CHEIA = "2026-11-30";

/**
 * Semanas antigas, curtas — só para a lista ter history.
 *
 * Elas existem por dois motivos: a paginação só aparece a partir da sétima
 * semana (são seis por página), e um card com destaque e entregas respondidas
 * mostra a barra de progresso em estados diferentes do da semana cheia.
 */
const ANTIGAS = [
  {
    weekNumber: 41,
    inicio: "2026-10-05",
    fim: "2026-10-09",
    highlight: "Mês aberto com o estoque da coleção nova fotografado.",
    entregas: [
      { day: "Segunda", block: "Conteúdo", expected: "Fotografar as peças da coleção nova", health: "NO_RITMO" as const },
    ],
  },
  {
    weekNumber: 42,
    inicio: "2026-10-12",
    fim: "2026-10-16",
    highlight: "Feriado no meio da semana derrubou a frequência de publicação.",
    entregas: [
      { day: "Terça", block: "Publicação", expected: "Publicar os três posts da semana", health: "ATENCAO" as const },
    ],
  },
  {
    weekNumber: 43,
    inicio: "2026-10-19",
    fim: "2026-10-23",
    highlight: "Primeira semana com o calendário editorial fechado na segunda.",
    entregas: [
      { day: "Terça", block: "Conteúdo", expected: "Gravar os looks da coleção nova", health: "NO_RITMO" as const },
      { day: "Quinta", block: "Publicação", expected: "Agendar a semana inteira de uma vez", health: "NO_RITMO" as const },
    ],
  },
  {
    weekNumber: 44,
    inicio: "2026-10-26",
    fim: "2026-10-30",
    highlight: "Campanha de Halloween saiu no dia, mas o engajamento ficou abaixo do esperado.",
    entregas: [
      { day: "Segunda", block: "Conteúdo", expected: "Produzir a campanha de Halloween", health: "ATENCAO" as const },
      { day: "Sexta", block: "Relatório", expected: "Fechar os números de outubro", health: "NO_RITMO" as const },
    ],
  },
  {
    weekNumber: 46,
    inicio: "2026-11-09",
    fim: "2026-11-13",
    highlight: "Semana sem publicação no YouTube — o canal segue sem dono.",
    entregas: [
      { day: "Quarta", block: "Comunidade", expected: "Repostar os UGC da Black Friday", health: "NO_RITMO" as const },
      { day: "Quinta", block: "Conteúdo", expected: "Roteirizar os vídeos do canal", health: "TRAVADO" as const },
    ],
  },
];

/** As respostas da pauta, na ordem das cinco perguntas do roteiro. */
const RESPOSTAS = [
  "Semana puxada na gravação (três dias em loja), mas sem hora extra. Energia boa.",
  "Os Reels de bastidores. Formato barato, sai no mesmo dia e teve o dobro do alcance da peça editada.",
  "O acesso ao Meta Business travou o fechamento dos números. Eu deveria ter aberto o chamado na segunda, não na quarta.",
  "Prioridade no chamado 4512 com a TI e o orçamento de mídia de dezembro aprovado.",
  "1) Três Reels por semana. 2) Calendário de janeiro fechado com a Vendas até quarta. 3) Relatório fechado na quinta, não na sexta.",
];

async function main() {
  const sub = await prisma.subsector.findUnique({
    where: { slug },
    select: { id: true, label: true, weeklyReportEnabled: true },
  });
  if (!sub) throw new Error(`Subsetor "${slug}" não encontrado.`);
  if (!sub.weeklyReportEnabled) {
    throw new Error(`O Relatório Semanal não está habilitado em ${sub.label}. Rode \`npm run setup:relatorio\` antes.`);
  }

  const periodos = [dia(SEMANA_ANTERIOR), dia(SEMANA_CHEIA), ...ANTIGAS.map((a) => dia(a.inicio))];
  const existentes = await prisma.weeklyReport.findMany({
    where: { subsectorId: sub.id, periodStart: { in: periodos } },
    select: { id: true, weekNumber: true },
  });

  if (limpar) {
    if (existentes.length === 0) {
      console.log("  · Não havia semana de exemplo para remover.");
      return;
    }
    await prisma.weeklyReport.deleteMany({ where: { id: { in: existentes.map((r) => r.id) } } });
    console.log(`  ✓ ${existentes.length} semana(s) de exemplo removida(s): ${existentes.map((r) => r.weekNumber).join(", ")}`);
    return;
  }

  if (existentes.length > 0) {
    throw new Error(
      `Já existe semana nesses períodos (${existentes.map((r) => `nº ${r.weekNumber}`).join(", ")}).` +
        `\nRode \`npx tsx scripts/semana-exemplo.ts --limpar\` antes de recriar.`,
    );
  }

  // O autor aparece no card ("Criada por …"). Qualquer pessoa ativa do
  // subsetor serve; sem ninguém lotado, a semana fica sem autor e o card
  // apenas não mostra a linha.
  const autor =
    (await prisma.user.findFirst({
      where: { active: true, subsectors: { some: { subsectorId: sub.id } } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    })) ??
    // Em base de desenvolvimento costuma não haver ninguém lotado na área.
    (await prisma.user.findFirst({
      where: { active: true, role: "ADMIN" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }));

  // ── As semanas antigas, curtas ──
  for (const a of ANTIGAS) {
    await prisma.weeklyReport.create({
      data: {
        subsectorId: sub.id,
        createdById: autor?.id ?? null,
        weekNumber: a.weekNumber,
        periodStart: dia(a.inicio),
        periodEnd: dia(a.fim),
        highlight: a.highlight,
        deliveries: { create: a.entregas.map((e, order) => ({ order, ...e })) },
        agenda: { create: AGENDA.map((item, order) => ({ order, ...item })) },
      },
    });
  }

  // ── A semana anterior: só os OKRs, para a média ter história ──
  await prisma.weeklyReport.create({
    data: {
      subsectorId: sub.id,
      createdById: autor?.id ?? null,
      weekNumber: 47,
      periodStart: dia(SEMANA_ANTERIOR),
      periodEnd: dia("2026-11-20"),
      highlight: "Semana de preparação: roteiros prontos e loja reservada para as gravações.",
      okrs: {
        create: [
          {
            order: 0,
            objective: "Marca conhecida sem depender de anúncio",
            keyResult: "Alcance orgânico mensal acima de 600 mil contas",
            measure: "Insights do Instagram — contas alcançadas",
            goalLabel: "600 mil/mês",
            goalValue: 600000,
            achieved: 150000,
            monthlyRead: true,
            health: "ATENCAO",
          },
          {
            order: 1,
            objective: "Converter audiência em conversa",
            keyResult: "500 conversas iniciadas no WhatsApp por mês",
            measure: "Conversas novas no WhatsApp Business",
            goalLabel: "500/mês",
            goalValue: 500,
            achieved: 236,
            monthlyRead: true,
            health: "NO_RITMO",
          },
        ],
      },
      agenda: { create: AGENDA.map((a, order) => ({ order, ...a })) },
    },
  });

  // ── A semana cheia ──
  await prisma.weeklyReport.create({
    data: {
      subsectorId: sub.id,
      createdById: autor?.id ?? null,
      weekNumber: 49,
      periodStart: dia(SEMANA_CHEIA),
      periodEnd: dia("2026-12-04"),
      highlight:
        "A série de bastidores no Reels puxou o alcance: 3 vídeos, 180 mil contas, sem um real de impulsionamento.",
      learning:
        "Vídeo curto gravado no celular rende mais que peça editada — e sai no mesmo dia. Parar de segurar conteúdo esperando a produção.",
      nextPriority: "Fechar o calendário de janeiro com a Vendas até quarta.",
      deliveries: {
        create: [
          {
            order: 0,
            day: "Segunda",
            block: "Conteúdo",
            expected: "Três Reels de bastidores publicados",
            health: "NO_RITMO",
            evidence: "https://www.instagram.com/reel/exemplo-bastidores/",
            note: "Gravado no celular, sem produção. Os três saíram no mesmo dia.",
          },
          {
            order: 1,
            day: "Segunda",
            block: "Comunidade",
            expected: "Responder comentários e DMs do fim de semana",
            health: "NO_RITMO",
            note: "Fila zerada até as 11h.",
          },
          {
            order: 2,
            day: "Terça",
            block: "Publicação",
            expected: "Agendar os posts de dezembro no Meta Business",
            health: "ATENCAO",
            note: "Agendado até o dia 12; o resto depende do calendário de janeiro.",
          },
          {
            order: 3,
            day: "Quarta",
            block: "Relatório",
            expected: "Fechar os números de novembro para a reunião",
            health: "TRAVADO",
            note: "Sem acesso ao Meta Business Suite — chamado 4512 aberto na quarta.",
          },
          {
            order: 4,
            day: "Quinta",
            block: "Conteúdo",
            expected: "Gravar o depoimento da cliente da Zona Sul",
            health: "NO_RITMO",
            evidence: "https://drive.google.com/file/d/exemplo-depoimento/view",
          },
          {
            order: 5,
            day: "Sexta",
            block: "Processo",
            expected: "Revisar o roteiro de atendimento do WhatsApp com a Vendas",
            note: "Reagendado para segunda — a Vendas estava em fechamento de mês.",
          },
        ],
      },
      metrics: {
        create: [
          {
            order: 0,
            channel: "Instagram",
            metric: "Alcance (contas)",
            previous: 90000,
            current: 180000,
            target: "120 mil/semana",
            health: "NO_RITMO",
            reading: "Dobrou com os Reels de bastidores, sem gastar em anúncio.",
          },
          {
            order: 1,
            channel: "Instagram",
            metric: "Seguidores novos",
            previous: 310,
            current: 486,
            target: "+300/semana",
            health: "NO_RITMO",
            reading: "Veio junto com o alcance; a maioria entrou nos dois dias dos Reels.",
          },
          {
            order: 2,
            channel: "WhatsApp",
            metric: "Conversas iniciadas",
            previous: 240,
            current: 198,
            target: "250/semana",
            health: "ATENCAO",
            reading: "Caiu na semana do feriado. Retomar com a campanha de janeiro.",
          },
          {
            order: 3,
            channel: "Site",
            metric: "Visitas vindas do Instagram",
            previous: 1250,
            current: 1620,
            target: "1.500/semana",
            health: "NO_RITMO",
            reading: "O link na bio com o Reels fixado respondeu pela alta.",
          },
          {
            order: 4,
            channel: "YouTube",
            metric: "Visualizações",
            previous: 820,
            current: 540,
            target: "1.000/semana",
            health: "TRAVADO",
            reading: "Nenhum vídeo novo há três semanas — o canal está sem dono.",
          },
        ],
      },
      okrs: {
        create: [
          {
            order: 0,
            objective: "Marca conhecida sem depender de anúncio",
            keyResult: "Alcance orgânico mensal acima de 600 mil contas",
            measure: "Insights do Instagram — contas alcançadas",
            goalLabel: "600 mil/mês",
            goalValue: 600000,
            achieved: 180000,
            monthlyRead: true,
            health: "ATENCAO",
            nextStep: "Manter três Reels por semana até o fim de janeiro.",
          },
          {
            order: 1,
            objective: "Converter audiência em conversa",
            keyResult: "500 conversas iniciadas no WhatsApp por mês",
            measure: "Conversas novas no WhatsApp Business",
            goalLabel: "500/mês",
            goalValue: 500,
            achieved: 198,
            monthlyRead: true,
            health: "ATENCAO",
            nextStep: "Chamada para o WhatsApp no fim de cada Reels.",
          },
          {
            order: 2,
            objective: "Rotina de conteúdo previsível",
            keyResult: "100% dos posts publicados no dia planejado",
            measure: "Cronograma × publicado, por semana",
            goalLabel: "100% na semana",
            goalValue: 100,
            achieved: 92,
            monthlyRead: false,
            health: "NO_RITMO",
            nextStep: "Deixar dois posts de reserva agendados para a semana do Natal.",
          },
        ],
      },
      blockers: {
        create: [
          {
            order: 0,
            title: "Acesso ao Meta Business Suite",
            impact: "Sem os números de anúncio, o relatório de novembro fecha incompleto",
            needs: "TI",
            dueDate: dia("2026-12-02"),
            health: "TRAVADO",
            resolution: "Chamado 4512 aberto; esperando a liberação do acesso.",
          },
          {
            order: 1,
            title: "Aprovação do orçamento de mídia de dezembro",
            impact: "Sem o valor, o calendário de janeiro não fecha com a Vendas",
            needs: "Carlos",
            dueDate: dia("2026-12-05"),
            health: "ATENCAO",
            resolution: "Levar na reunião de sexta com os números de novembro na mão.",
          },
        ],
      },
      agenda: {
        create: AGENDA.map((a, order) => ({ order, ...a, answer: RESPOSTAS[order] ?? null })),
      },
    },
  });

  console.log(
    `  ✓ ${ANTIGAS.length + 2} semanas criadas em ${sub.label}: a 49 cheia, a 47 com os OKRs da média e ` +
      `${ANTIGAS.map((a) => a.weekNumber).join(", ")} curtas (é o que faz a paginação aparecer)`,
  );
  if (autor) console.log(`  · Autor: ${autor.fullName}`);
  console.log(`\nAbra /setores/${slug} → aba Relatório Semanal e clique no card da Semana 49.`);
  console.log("Para remover: npx tsx scripts/semana-exemplo.ts --limpar");
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
