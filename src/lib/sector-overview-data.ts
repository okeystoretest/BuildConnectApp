import { prisma } from "@/lib/db/prisma";
import { canAccessSlug, resolveAccessibleSlugs } from "@/lib/auth/access";
import { dateLabelBR } from "@/lib/brasilia";
import { isMultiRaterSlug } from "@/lib/evaluation-rounds-config";
import { ROLE_LABEL } from "@/lib/permissions";
import { TRACKED_SUBSECTOR, trackedSubsectorIdsOf } from "@/lib/progress-scope";
import { PEOPLE_SECTOR_SLUG } from "@/lib/sector-evaluations-data";
import { isPassing } from "@/lib/video-comprehension";
import { averageOf } from "@/lib/video-rating";
import {
  approvedAverage,
  progressPct,
  splitGrades,
  type MemberEvaluation,
  type MemberEvaluationGap,
  type MemberOverview,
  type MemberPerformanceEvaluation,
  type PendingContentItem,
} from "@/lib/sector-overview";
import type { Role } from "@/types";

/** Um vídeo do setor com as médias de qualidade que os colaboradores deram. */
export interface VideoQualityRow {
  videoId: string;
  title: string;
  subsector: string;
  /** Miniatura (.webp) capturada no envio. Sem ela, o card usa o placeholder. */
  thumbnailPath?: string;
  ratings: number;
  audio: number | null;
  image: number | null;
  clarity: number | null;
  /** Média dos três critérios. Nula quando ninguém avaliou. */
  average: number | null;
}

/** Um subsetor selecionável dentro de um setor. */
export interface OverviewSubscope {
  subsectorId: string;
  subsectorLabel: string;
}

/** Uma pílula do seletor: um setor e os subsetores que ele abre. */
export interface OverviewScope {
  sectorId: string;
  sectorLabel: string;
  /** Só os PADRAO: a vitrine não tem equipe nem material a concluir. */
  subsectors: OverviewSubscope[];
}

/** O que se está olhando. */
export interface OverviewTarget {
  sectorId: string;
  /**
   * Recorte opcional por subsetor. Nulo = o setor inteiro.
   *
   * Filtra QUEM aparece, nunca o número de ninguém: o denominador de cada
   * pessoa já é o dos subsetores dela (`trackedSubsectorIdsOf`), então a
   * mesma pessoa exibe o mesmo percentual com ou sem filtro. Era exatamente
   * isso que faltava em 22/09, quando a pílula de subsetor foi removida por
   * dar dois percentuais à mesma pessoa.
   */
  subsectorId?: string | null;
}

export interface SectorOverview {
  sectorId: string;
  sectorLabel: string;
  /** Subsetor em foco, ou nulo para o setor inteiro. */
  subsectorId: string | null;
  subsectorLabel: string | null;
  /** Colaboradores NO RECORTE aberto, não no setor. */
  memberCount: number;
  totalItems: number;
  doneItems: number;
  progress: number;
  /** Média do setor: TODAS as notas aprovadas, um denominador só. */
  average: number | null;
  rejections: number;
  members: MemberOverview[];
  videos: VideoQualityRow[];
}

/**
 * As pílulas do seletor: um setor, uma pílula, e os subsetores que ele abre.
 *
 * O recorte por subsetor existiu até 22/09, saiu, e voltou em 11/11. O que o
 * derrubou foi ele mexer no DENOMINADOR junto, de modo que a mesma pessoa
 * tinha um percentual em cada pílula. Hoje o denominador é por pessoa e não
 * depende de pílula nenhuma — o filtro escolhe quem entra na lista, e só.
 *
 * `onlySectorId` recorta a lista a um setor: é o caso do Gestor, que não
 * escolhe setor mas precisa dos subsetores do dele. O recorte aqui é
 * conveniência de tela; quem prende o Gestor ao próprio setor é a página e a
 * rota, cada uma conferindo de novo.
 */
export async function listScopesForOverview(
  onlySectorId?: string | null,
): Promise<OverviewScope[]> {
  const sectors = await prisma.sector.findMany({
    where: onlySectorId ? { id: onlySectorId } : undefined,
    orderBy: { order: "asc" },
    select: {
      id: true,
      label: true,
      subsectors: {
        where: TRACKED_SUBSECTOR,
        orderBy: { order: "asc" },
        select: { id: true, label: true },
      },
    },
  });
  return sectors.map((sector) => ({
    sectorId: sector.id,
    sectorLabel: sector.label,
    subsectors: sector.subsectors.map((sub) => ({
      subsectorId: sub.id,
      subsectorLabel: sub.label,
    })),
  }));
}

/**
 * O painel de um setor. A régua do progresso é a mesma de "Meu Progresso" e do
 * "Histórico do Colaborador" (`trackedSubsectorIdsOf`): o denominador de cada
 * pessoa são os subsetores DELA. Se o painel do gestor discordar do que o
 * colaborador vê na própria tela, os dois percebem.
 */
/**
 * Para onde o atalho de uma avaliação pendente leva o AVALIADOR.
 *
 * O slug é de um subsetor que QUEM OLHA alcança, e não do colaborador do card:
 * a ferramenta de lá já lista a equipe inteira do setor (ver
 * `getSectorEvaluations`), então qualquer subsetor acessível abre a mesma
 * fila — e um slug fora do alcance do visitante daria "página não encontrada"
 * na própria rota, que confere o acesso de novo.
 *
 * Só subsetor PADRAO: a vitrine não tem a aba de Avaliações.
 *
 * O DHO devolve `null` sempre: lá a ferramenta de preenchimento não existe —
 * aquele setor concentra os RESULTADOS (ver `getSectorEvaluations`, que
 * devolve null para ele). Um atalho apontaria para uma aba que não está lá.
 *
 * `null` quando nenhum serve. Pendência sem atalho é honesta; atalho que não
 * abre é pior do que atalho nenhum.
 */
export async function resolveEvaluationsHref(
  viewerId: string,
  role: Role,
  sectorId: string,
): Promise<string | null> {
  const [sector, allowed] = await Promise.all([
    prisma.sector.findUnique({
      where: { id: sectorId },
      select: {
        slug: true,
        subsectors: {
          where: TRACKED_SUBSECTOR,
          orderBy: { order: "asc" },
          select: { slug: true },
        },
      },
    }),
    resolveAccessibleSlugs(viewerId, role),
  ]);
  if (!sector || sector.slug === PEOPLE_SECTOR_SLUG) return null;

  const slug = sector.subsectors.find((s: { slug: string }) =>
    canAccessSlug(allowed, s.slug),
  )?.slug;
  return slug ? `/setores/${slug}?aba=avaliacoes` : null;
}

export async function getSectorOverview(target: OverviewTarget): Promise<SectorOverview> {
  const { sectorId, subsectorId = null } = target;

  /*
   * O recorte do CONTEÚDO: todo o material PADRAO do setor. A vitrine fica
   * fora — não há o que concluir nela, e contá-la no denominador travaria o
   * progresso de todo mundo abaixo de 100%.
   */
  const contentScope = { sectorId, ...TRACKED_SUBSECTOR };

  const [sector, roster, subsectors] = await Promise.all([
    prisma.sector.findUnique({ where: { id: sectorId }, select: { label: true } }),
    prisma.user.findMany({
      where: { sectorId, active: true },
      orderBy: { fullName: "asc" },
      // `createdAt` é data de CADASTRO. O modelo não guarda admissão, e o card
      // rotula o campo como cadastro para não sugerir o que não sabe.
      select: {
        id: true,
        fullName: true,
        role: true,
        avatarPath: true,
        createdAt: true,
        // A marcação de subsetor do cadastro, que decide o DENOMINADOR de
        // cada pessoa (ver `trackedSubsectorIdsOf`). Vem junto da lista para
        // o painel resolver N colaboradores sem N consultas.
        subsectors: { select: { subsectorId: true } },
      },
    }),
    prisma.subsector.findMany({
      where: contentScope,
      select: {
        id: true,
        label: true,
        videos: { select: { id: true, title: true, thumbnailPath: true } },
        // `name` entrou junto: o modal de pendências lista os itens, e uma
        // lista de ids não diz a ninguém o que falta ler.
        documents: { select: { id: true, name: true } },
      },
    }),
  ]);

  /*
   * Todo mundo lotado no setor. A marcação de subsetor no cadastro decide o
   * ACESSO da pessoa, e não quem aparece aqui: o painel responde "como está a
   * equipe do setor", e uma equipe recortada responderia outra pergunta.
   */
  const members = roster;

  const memberIds = members.map((m) => m.id);
  const videoIds = subsectors.flatMap((s) => s.videos.map((v) => v.id));
  const totalItems = videoIds.length + subsectors.reduce((n, s) => n + s.documents.length, 0);

  const [done, graded, ratings, performance, typeScales, personnelFiles] = await Promise.all([
    prisma.contentProgress.findMany({
      where: {
        userId: { in: memberIds },
        completed: true,
        OR: [
          { video: { subsector: contentScope } },
          { document: { subsector: contentScope } },
        ],
      },
      // Antes vinha só `userId`, para contar. Agora vem o item: o card abre a
      // lista do que falta, e para saber o que falta é preciso saber o que foi
      // feito — a subtração sozinha dá um número, não uma lista.
      select: { userId: true, videoId: true, documentId: true },
    }),
    // As notas vêm inteiras, e não só o número: o card lista as avaliações já
    // dadas àquela pessoa, e uma segunda consulta por colaborador aberto seria
    // uma ida ao banco por clique.
    prisma.videoComprehension.findMany({
      where: { userId: { in: memberIds }, gradedAt: { not: null } },
      orderBy: { gradedAt: "desc" },
      select: {
        id: true,
        userId: true,
        grade: true,
        attempt: true,
        gradedAt: true,
        video: { select: { title: true } },
      },
    }),
    // Os comentários saíram do card, então saem também da consulta: dado
    // carregado e nunca exibido é peso que ninguém cobra de volta.
    prisma.videoRating.findMany({
      where: { videoId: { in: videoIds } },
      select: { videoId: true, audio: true, image: true, clarity: true },
    }),
    /*
     * Avaliações de DESEMPENHO já respondidas sobre estes colaboradores. O
     * Gestor alcança isto porque a matriz já lhe dá `evaluations.view`; o
     * recorte é a equipe do setor dele, que é a mesma lista de sempre.
     *
     * `RASCUNHO` fica de fora: uma avaliação ainda sendo preenchida não é
     * histórico, é trabalho em andamento de outra pessoa.
     */
    prisma.evaluation.findMany({
      where: { subjectId: { in: memberIds }, status: "CONCLUIDA" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subjectId: true,
        total: true,
        cycle: true,
        isSelfAssessment: true,
        createdAt: true,
        type: { select: { id: true, title: true, scaleMax: true } },
        evaluator: { select: { fullName: true } },
      },
    }),
    /*
     * Teto de pontos de cada formulário: nº de questões × nota máxima da
     * escala. Sem ele, `total` é um número solto — "34" não informa nada sem
     * saber se o máximo era 40 ou 170. São poucos tipos, então vêm todos de
     * uma vez em vez de uma consulta por avaliação encontrada.
     */
    prisma.evaluationType.findMany({
      // `slug`, `title` e a ordem entraram para esta MESMA consulta servir
      // também à lista de instrumentos pendentes do card: o catálogo completo
      // já estava sendo lido aqui, e buscá-lo de novo seria a segunda viagem
      // ao banco pela mesma tabela.
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        scaleMax: true,
        sections: { select: { _count: { select: { questions: true } } } },
      },
    }),
    /*
     * Quantos documentos pessoais cada um já tem arquivado. Só a CONTAGEM: o
     * card mostra um número e o modal busca as pastas sob demanda
     * (`fetchPersonnelFolders`). Trazer os arquivos aqui seria carregar a
     * documentação do setor inteiro para exibir um botão.
     */
    prisma.personnelFile.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: memberIds } },
      _count: { _all: true },
    }),
  ]);

  const personnelCount = new Map(
    (personnelFiles as { ownerId: string; _count: { _all: number } }[]).map(
      (r) => [r.ownerId, r._count._all] as const,
    ),
  );

  // O que cada pessoa já concluiu, por id de conteúdo. É a outra metade da
  // lista de pendências: catálogo DELA menos isto. Só por id, sem contagem
  // própria — contar aqui somaria o que ela viu fora do escopo dela.
  const doneIdsByUser = new Map<string, Set<string>>();
  for (const d of done) {
    const ids = doneIdsByUser.get(d.userId) ?? new Set<string>();
    const contentId = d.videoId ?? d.documentId;
    if (contentId) ids.add(contentId);
    doneIdsByUser.set(d.userId, ids);
  }

  /*
   * Catálogo POR SUBSETOR, na ordem em que o modal mostra: vídeos antes de
   * documentos. Montado uma vez e recortado por pessoa — cada colaborador
   * pega só os subsetores dele, e remontar a lista dentro do `map` de
   * colaboradores seria refazer o mesmo trabalho N vezes.
   */
  const catalogBySubsector = new Map<string, PendingContentItem[]>();
  for (const sub of subsectors) {
    const items: PendingContentItem[] = [];
    for (const v of sub.videos) {
      items.push({ id: v.id, title: v.title, kind: "VIDEO", subsector: sub.label });
    }
    for (const d of sub.documents) {
      items.push({ id: d.id, title: d.name, kind: "DOCUMENTO", subsector: sub.label });
    }
    catalogBySubsector.set(sub.id, items);
  }
  const subsectorIds = subsectors.map((s) => s.id);

  /*
   * Catálogo de instrumentos, na ordem em que o DHO os organizou. Montado uma
   * vez e filtrado por pessoa, como o catálogo de conteúdo acima.
   */
  const evaluationCatalog: MemberEvaluationGap[] = typeScales.map((t) => ({
    typeId: t.id,
    typeSlug: t.slug,
    typeTitle: t.title,
    multiRater: isMultiRaterSlug(t.slug),
  }));

  // Teto de pontos por tipo de formulário, para `total` ganhar escala.
  const maxTotalByType = new Map<string, number>();
  for (const t of typeScales) {
    const questions = t.sections.reduce((n, sec) => n + sec._count.questions, 0);
    if (questions > 0) maxTotalByType.set(t.id, questions * t.scaleMax);
  }

  const performanceByUser = new Map<string, MemberPerformanceEvaluation[]>();
  /*
   * Quais instrumentos cada pessoa JÁ tem. Sai do mesmo `performance` que
   * alimenta o histórico — ele já traz `type.id` e já filtra `CONCLUIDA`, de
   * modo que um rascunho de outra pessoa não marca a avaliação como feita.
   */
  const doneTypesByUser = new Map<string, Set<string>>();
  for (const e of performance) {
    const doneTypes = doneTypesByUser.get(e.subjectId) ?? new Set<string>();
    doneTypes.add(e.type.id);
    doneTypesByUser.set(e.subjectId, doneTypes);

    const entries = performanceByUser.get(e.subjectId) ?? [];
    entries.push({
      id: e.id,
      title: e.type.title,
      total: e.total,
      maxTotal: e.total === null ? null : (maxTotalByType.get(e.type.id) ?? null),
      cycleLabel: e.cycle === null ? undefined : `Ciclo ${e.cycle}`,
      // O avaliador some do vínculo quando o cadastro dele é removido
      // (`onDelete: SetNull`): a avaliação continua valendo, sem o nome.
      evaluatorName: e.evaluator?.fullName ?? "—",
      selfAssessment: e.isSelfAssessment,
      createdAtLabel: dateLabelBR(e.createdAt),
    });
    performanceByUser.set(e.subjectId, entries);
  }

  const gradesByUser = new Map<string, { grade: number }[]>();
  const evaluationsByUser = new Map<string, MemberEvaluation[]>();
  const allGrades: { grade: number }[] = [];
  for (const g of graded) {
    // `grade` e `gradedAt` não são nulos aqui (o filtro acima garante); o
    // TypeScript não tem como saber disso.
    if (g.grade == null || g.gradedAt == null) continue;
    const list = gradesByUser.get(g.userId) ?? [];
    list.push({ grade: g.grade });
    gradesByUser.set(g.userId, list);
    allGrades.push({ grade: g.grade });

    const entries = evaluationsByUser.get(g.userId) ?? [];
    entries.push({
      id: g.id,
      videoTitle: g.video.title,
      grade: g.grade,
      attempt: g.attempt,
      gradedAtLabel: dateLabelBR(g.gradedAt),
      passed: isPassing(g.grade),
    });
    evaluationsByUser.set(g.userId, entries);
  }

  const memberRows: MemberOverview[] = members.flatMap((m) => {
    const { approved, rejections } = splitGrades(gradesByUser.get(m.id) ?? []);
    /*
     * O denominador é O DESTA PESSOA: os subsetores em que ela está marcada
     * no cadastro ou, sem marcação, todos os do setor. Dois colegas do mesmo
     * setor lotados em subsetores diferentes devem coisas diferentes, e um
     * denominador comum cobraria de cada um o material do outro.
     */
    const escopo = new Set(
      trackedSubsectorIdsOf(
        m.subsectors.map((s) => s.subsectorId),
        subsectorIds,
      ),
    );
    /*
     * Recorte por subsetor: entra quem RESPONDE por ele — a mesma régua do
     * denominador. Quem não marcou subsetor nenhum responde pelo setor
     * inteiro, e por isso aparece em qualquer filtro dele: escondê-lo faria
     * pessoas sumirem do painel sem que ninguém as tivesse excluído.
     */
    if (subsectorId && !escopo.has(subsectorId)) return [];

    const catalog = subsectors
      .filter((sub) => escopo.has(sub.id))
      .flatMap((sub) => catalogBySubsector.get(sub.id) ?? []);
    const doneIds = doneIdsByUser.get(m.id) ?? new Set<string>();
    const pendingList = catalog.filter((item) => !doneIds.has(item.id));
    /*
     * Concluídos DENTRO do escopo: o que a pessoa viu num subsetor que não é
     * dela não pode empurrar o percentual dela acima do próprio denominador.
     */
    const doneItems = catalog.length - pendingList.length;
    const doneTypes = doneTypesByUser.get(m.id) ?? new Set<string>();
    return [{
      userId: m.id,
      name: m.fullName,
      role: ROLE_LABEL[m.role as Role],
      avatarPath: m.avatarPath ?? undefined,
      sinceLabel: dateLabelBR(m.createdAt),
      doneItems,
      totalItems: catalog.length,
      progress: progressPct(doneItems, catalog.length),
      average: approvedAverage(approved),
      rejections,
      pending: pendingList.length,
      pendingList,
      evaluations: evaluationsByUser.get(m.id) ?? [],
      performance: performanceByUser.get(m.id) ?? [],
      evaluationGaps: evaluationCatalog.filter((t) => !doneTypes.has(t.typeId)),
      personnelFiles: personnelCount.get(m.id) ?? 0,
    }];
  });

  // Média do setor: um denominador só. A média das médias daria o mesmo peso a
  // quem tem uma nota e a quem tem trinta.
  const sectorSplit = splitGrades(allGrades);

  const byVideo = new Map<string, VideoQualityRow>();
  for (const sub of subsectors) {
    // A aba de qualidade acompanha o filtro: a pílula diz qual recorte está
    // aberto, e metade da tela ignorá-la seria a pessoa ler dois escopos ao
    // mesmo tempo sem saber qual vale.
    if (subsectorId && sub.id !== subsectorId) continue;
    for (const v of sub.videos) {
      byVideo.set(v.id, {
        videoId: v.id,
        title: v.title,
        subsector: sub.label,
        thumbnailPath: v.thumbnailPath ?? undefined,
        ratings: 0,
        audio: null,
        image: null,
        clarity: null,
        average: null,
      });
    }
  }

  const raw = new Map<
    string,
    { audio: (number | null)[]; image: (number | null)[]; clarity: (number | null)[] }
  >();
  for (const r of ratings) {
    const bucket = raw.get(r.videoId) ?? { audio: [], image: [], clarity: [] };
    bucket.audio.push(r.audio);
    bucket.image.push(r.image);
    bucket.clarity.push(r.clarity);
    raw.set(r.videoId, bucket);

    const row = byVideo.get(r.videoId);
    if (!row) continue;
    row.ratings += 1;
  }
  for (const [id, bucket] of raw) {
    const row = byVideo.get(id);
    if (!row) continue;
    row.audio = averageOf(bucket.audio);
    row.image = averageOf(bucket.image);
    row.clarity = averageOf(bucket.clarity);
    // Média dos TRÊS critérios, não das notas soltas: cada critério já é uma
    // média, e dar peso maior ao que mais gente respondeu diria que clareza
    // vale menos quando menos gente opinou sobre ela.
    row.average = averageOf([row.audio, row.image, row.clarity]);
  }

  // Pior primeiro: a pergunta real é "qual vídeo precisa ser refeito?". Vídeo
  // sem avaliação não é ruim, é desconhecido — vai para o fim.
  const videos = [...byVideo.values()].sort((a, b) => {
    if (a.average === null && b.average === null) {
      return a.title.localeCompare(b.title, "pt-BR");
    }
    if (a.average === null) return 1;
    if (b.average === null) return -1;
    return a.average - b.average;
  });

  /*
   * Progresso do setor: a soma do que a equipe JÁ concluiu sobre a soma do
   * que ela DEVE.
   *
   * Não é mais um denominador único multiplicado pelo número de pessoas: cada
   * uma tem o seu, e o produto cobraria de todo mundo o material de todo
   * mundo. Quem está marcado só no almoxarifado entra na conta com os itens
   * do almoxarifado, não com o acervo da Produção inteira.
   */
  const doneItems = memberRows.reduce((n, m) => n + m.doneItems, 0);
  const requiredItems = memberRows.reduce((n, m) => n + m.totalItems, 0);
  return {
    sectorId,
    sectorLabel: sector?.label ?? "—",
    subsectorId,
    // Nulo quando não há filtro, e também quando o id não é deste setor — a
    // página já ignora o forjado, e aqui o rótulo não inventa um nome.
    subsectorLabel: subsectorId
      ? (subsectors.find((s) => s.id === subsectorId)?.label ?? null)
      : null,
    memberCount: memberRows.length,
    // O catálogo PADRAO do setor. NÃO é o denominador do progresso — esse é
    // por pessoa, em `MemberOverview.totalItems`.
    totalItems,
    doneItems,
    progress: progressPct(doneItems, requiredItems),
    average: approvedAverage(sectorSplit.approved),
    rejections: sectorSplit.rejections,
    members: memberRows,
    videos,
  };
}
