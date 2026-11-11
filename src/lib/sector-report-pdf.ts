import { PdfDocument, rgb, type PdfColor } from "@/lib/pdf/pdf-document";
import { folderStatusLabel } from "@/lib/personnel-expiry";
import type { MemberOverview } from "@/lib/sector-overview";
import type { PersonnelFolderGroup } from "@/types/hr";

/**
 * RELATÓRIO DE PROGRESSO INDIVIDUAL — "Meu Setor"
 * ---------------------------------------------------------------------------
 * Um bloco por colaborador, com tudo o que o card da tela mostra em modais
 * separados: cadastro, avanço no conteúdo, média e reprovações das avaliações
 * de vídeo, pendências, histórico de avaliações (quantidade E detalhamento) e
 * as pastas do Departamento Pessoal.
 *
 * Só montagem: quem decide o ESCOPO e o ALCANCE é a rota — este módulo recebe
 * o que já foi liberado e desenha. É o que o mantém testável sem banco.
 *
 * ── Decisões de visualização ───────────────────────────────────────────────
 *
 * As cores das marcas foram VALIDADAS, não escolhidas a olho (azul #2a78d6 +
 * aqua #1baf7a + âmbar #b0680a passam juntas em separação para daltonismo e em
 * contraste sobre papel branco). O laranja que seria o segundo slot natural
 * ficou de fora: ele cai a ΔE 11,4 do âmbar de alerta, abaixo do piso de 15, e
 * os dois dividem a mesma página.
 *
 * NÃO há gráfico de rosca nem de pizza. O progresso do setor é uma relação de
 * duas partes (concluído × restante), e uma pizza de duas fatias é um número
 * disfarçado de gráfico: ele vira cartão de destaque com barra de progresso. O
 * que de fato compara grandeza — o avanço e a média de CADA colaborador — vira
 * barra, que é a forma que deixa a diferença entre as pessoas legível.
 *
 * As barras seguem a régua: espessura fina, base quadrada na linha de origem,
 * ponta arredondada, rótulo direto ao lado (nunca dentro, onde não caberia), e
 * nenhuma legenda — cada gráfico tem UMA série, então o título já diz o que é.
 * Cor nunca carrega sentido sozinha: todo estado vem com a palavra junto, o que
 * importa num documento que costuma ser impresso em preto e branco.
 */

/* ---------------------------------------------------------------- paleta -- */

/** Tinta principal e secundária. Texto nunca veste a cor de uma série. */
const INK = rgb(11, 11, 11);
const INK_2 = rgb(82, 81, 78);
/** Cinza um passo fora da superfície: réguas, trilhos e bordas, recessivos. */
const LINHA = rgb(224, 227, 231);
const TRILHO = rgb(235, 238, 242);
const PAINEL = rgb(245, 246, 248);
/** Série 1 — avanço no conteúdo. */
const SERIE_PROGRESSO = rgb(42, 120, 214);
/** Série 2 — média das avaliações de vídeo. Outro gráfico, outra grandeza. */
const SERIE_MEDIA = rgb(27, 175, 122);
/** Estado que cobra ação. Sempre acompanhado da palavra. */
const ALERTA = rgb(176, 104, 10);

/* ------------------------------------------------------------- contratos -- */

export interface SectorReportMember {
  member: MemberOverview;
  /** Credencial no padrão nome#BC. */
  username: string;
  /** Só dígitos, como o banco guarda. Ausente em cadastro antigo. */
  phone?: string;
  unitLabel?: string;
  subsectorLabels: readonly string[];
  /**
   * Pastas do Departamento Pessoal desta pessoa.
   *
   * `null` significa FORA DO ALCANCE de quem pediu o relatório — e o bloco
   * então diz isso, em vez de sair vazio: uma seção vazia leria como "não tem
   * documento arquivado", que é uma afirmação diferente e falsa.
   */
  folders: readonly PersonnelFolderGroup[] | null;
}

export interface SectorReportInput {
  sectorLabel: string;
  /** Quem pediu, impresso no rodapé: o relatório carrega documentação. */
  requestedByName: string;
  generatedAtLabel: string;
  progress: number;
  average: number | null;
  memberCount: number;
  rejections: number;
  members: readonly SectorReportMember[];
}

/* ----------------------------------------------------------------- texto -- */

/** Média ausente é travessão, nunca 0,0 — ver o card do painel. */
function mediaLabel(average: number | null): string {
  if (average === null) return "—";
  return average.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Telefone só-dígitos ganha máscara apenas na leitura. */
function telefoneLabel(phone?: string): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

/** Primeiro nome + inicial, para caber no rótulo estreito do gráfico. */
export function nomeCurto(nome: string, limite = 18): string {
  const limpo = nome.trim();
  if (limpo.length <= limite) return limpo;
  const [primeiro, ...resto] = limpo.split(/\s+/);
  const inicial = resto.at(-1)?.[0];
  const curto = inicial ? `${primeiro} ${inicial}.` : (primeiro ?? limpo);
  return curto.length <= limite ? curto : `${limpo.slice(0, limite - 1)}…`;
}

/* --------------------------------------------------------------- ícones -- */

/**
 * Ícones desenhados à mão, em vetor.
 *
 * O gerador não embute fonte de ícone — e embutir uma por causa de meia dúzia
 * de símbolos pesaria mais que o relatório inteiro. São formas simples, do
 * tamanho da linha de texto, e nenhuma delas carrega sentido sozinha: ao lado
 * de cada uma há sempre a palavra.
 */
function iconeVisto(doc: PdfDocument, x: number, y: number, cor: PdfColor): void {
  doc.strokePath(
    [
      [x + 1, y + 3.4],
      [x + 2.9, y + 5.3],
      [x + 6.6, y + 1.3],
    ],
    1.3,
    cor,
  );
}

function iconeAlerta(doc: PdfDocument, x: number, y: number, cor: PdfColor): void {
  doc.polygon(
    [
      [x + 3.6, y],
      [x + 7.2, y + 6.4],
      [x, y + 6.4],
    ],
    cor,
  );
}

function iconePonto(doc: PdfDocument, x: number, y: number, cor: PdfColor): void {
  doc.circle(x + 2.6, y + 2.6, 2.6, cor);
}

/** Folha com o canto dobrado: identifica um documento arquivado. */
function iconeDocumento(doc: PdfDocument, x: number, y: number, cor: PdfColor): void {
  doc.polygon(
    [
      [x, y],
      [x + 3.8, y],
      [x + 5.6, y + 1.8],
      [x + 5.6, y + 7],
      [x, y + 7],
    ],
    cor,
  );
}

/* ------------------------------------------------------------ componentes -- */

/**
 * Cartão de indicador: rótulo pequeno em cima, número grande embaixo.
 *
 * O número é o gráfico. Para uma relação de duas partes (concluído × restante)
 * isso é mais honesto que uma pizza de duas fatias, que não ajuda a ler nada
 * que o número já não diga.
 */
function kpiCard(
  doc: PdfDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { label: string; value: string; hint?: string; cor?: PdfColor; progresso?: number },
): void {
  doc.roundedRect(x, y, w, h, 5, PAINEL);
  doc.drawText(opts.label.toUpperCase(), x + 9, y + 14, { size: 6.5, font: "bold", color: INK_2 });
  doc.drawText(opts.value, x + 9, y + 32, { size: 16, font: "bold", color: opts.cor ?? INK });

  if (opts.progresso !== undefined) {
    // A barra repete o número em forma — quem bate o olho vê a proporção sem ler.
    barraDeProgresso(doc, x + 9, y + 38, w - 18, 4, opts.progresso, opts.cor ?? SERIE_PROGRESSO);
  } else if (opts.hint) {
    doc.drawText(opts.hint, x + 9, y + 41, { size: 6.5, color: INK_2 });
  }
}

/** Trilho + preenchimento, em pílula. Idioma de progresso, não de gráfico. */
function barraDeProgresso(
  doc: PdfDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  cor: PdfColor,
): void {
  const limitado = Math.max(0, Math.min(100, pct));
  doc.roundedRect(x, y, w, h, h / 2, TRILHO);
  // Zero não desenha nada: um resquício de barra leria como "já começou".
  if (limitado > 0) doc.roundedRect(x, y, (w * limitado) / 100, h, h / 2, cor);
}

interface LinhaDeBarra {
  label: string;
  /** Nulo = sem medida. Não desenha barra — ver `mediaLabel`. */
  value: number | null;
  valueLabel: string;
}

/**
 * Gráfico de barras horizontais, série única.
 *
 * Sem legenda (uma série só — o título já diz o que é), sem grade (o rótulo
 * direto de cada barra dispensa), base quadrada na origem e ponta arredondada.
 * O rótulo fica FORA da barra: dentro ele não caberia na barra curta, que é
 * justamente a que mais precisa ser lida.
 */
function graficoDeBarras(
  doc: PdfDocument,
  opts: {
    titulo: string;
    subtitulo: string;
    linhas: readonly LinhaDeBarra[];
    max: number;
    cor: PdfColor;
    vazio: string;
  },
): void {
  doc.text(opts.titulo, { size: 9.5, font: "bold", color: INK, spacing: 1 });
  doc.text(opts.subtitulo, { size: 7.5, color: INK_2, spacing: 5 });

  if (opts.linhas.length === 0) {
    doc.text(opts.vazio, { size: 8, color: INK_2, indent: 2, spacing: 4 });
    return;
  }

  const xRotulo = doc.marginX;
  const larguraRotulo = 96;
  const xBase = xRotulo + larguraRotulo;
  const larguraValor = 42;
  const larguraPista = doc.contentWidth - larguraRotulo - larguraValor;
  const altura = 9;
  // Passo = barra + folga. A folga é o que separa marcas vizinhas; barra
  // encostando em barra vira bloco único.
  const passo = altura + 7;

  for (const linha of opts.linhas) {
    doc.ensureSpace(passo);
    const y = doc.y;
    doc.drawText(nomeCurto(linha.label), xRotulo, y + altura - 1.5, { size: 7.5, color: INK_2 });

    /*
     * Zero não desenha nada, pela mesma razão da barra de progresso: uma lasca
     * de barra onde o valor é 0 lê como "já começou um pouquinho", que é
     * exatamente o contrário do que o dado diz. O rótulo continua lá — é ele
     * que informa o zero.
     */
    if (linha.value !== null && linha.value > 0 && opts.max > 0) {
      const largura = (larguraPista * Math.min(linha.value, opts.max)) / opts.max;
      // Base quadrada à esquerda, ponta arredondada à direita.
      doc.roundedRect(xBase, y, largura, altura, { tr: 4, br: 4 }, opts.cor);
      doc.drawText(linha.valueLabel, xBase + largura + 6, y + altura - 1.5, {
        size: 7.5,
        font: "bold",
        color: INK,
      });
    } else {
      doc.drawText(linha.valueLabel, xBase + 2, y + altura - 1.5, { size: 7.5, color: INK_2 });
    }
    doc.y += passo;
  }
  // Linha de origem, fina e recessiva — é referência, não dado.
  doc.rect(xBase, doc.y - 7, larguraPista, 0.5, LINHA);
  doc.moveDown(10);
}

/** Cabeçalho de seção: ponto colorido + palavra em caixa alta. */
function secao(doc: PdfDocument, texto: string, cor: PdfColor = INK_2): void {
  doc.moveDown(6);
  doc.ensureSpace(14);
  iconePonto(doc, doc.marginX + 10, doc.y + 1, cor);
  doc.drawText(texto.toUpperCase(), doc.marginX + 20, doc.y + 7, {
    size: 7,
    font: "bold",
    color: INK_2,
  });
  doc.y += 12;
}

interface ColunaDeTabela {
  titulo: string;
  /** Fração da largura útil da tabela. A soma deve dar 1. */
  fr: number;
  alinharADireita?: boolean;
}

/**
 * Tabela com cabeçalho e listras.
 *
 * As listras existem para o olho não pular de linha num bloco longo; elas são
 * um passo fora da superfície, para não competir com o dado. Célula que não
 * cabe é CORTADA com reticências em vez de invadir a vizinha.
 */
function tabela(
  doc: PdfDocument,
  colunas: readonly ColunaDeTabela[],
  linhas: readonly (readonly string[])[],
  opts: { corDoTexto?: (linha: number) => PdfColor } = {},
): void {
  const x0 = doc.marginX + 10;
  const largura = doc.contentWidth - 10;
  const larguras = colunas.map((c) => c.fr * largura);
  const alturaLinha = 14;

  /**
   * Desenha a faixa de cabeçalho na posição atual.
   *
   * É função porque o cabeçalho é REDESENHADO quando a tabela vira a página:
   * linha solta no topo da folha seguinte, sem as colunas, não se lê — foi o
   * que apareceu na primeira amostra impressa.
   */
  function cabecalho(): void {
    const y = doc.y;
    doc.rect(x0, y, largura, alturaLinha, PAINEL);
    let x = x0;
    for (const [i, col] of colunas.entries()) {
      const w = larguras[i] ?? 0;
      const texto = col.titulo.toUpperCase();
      const tx = col.alinharADireita ? x + w - 6 - doc.textWidth(texto, 6, "bold") : x + 6;
      doc.drawText(texto, tx, y + 9.5, { size: 6, font: "bold", color: INK_2 });
      x += w;
    }
    doc.y = y + alturaLinha;
  }

  doc.ensureSpace(alturaLinha * 2);
  cabecalho();

  for (const [n, linha] of linhas.entries()) {
    if (doc.ensureSpace(alturaLinha)) cabecalho();
    const y = doc.y;
    let x = x0;
    if (n % 2 === 1) doc.rect(x0, y, largura, alturaLinha, PAINEL);
    const cor = opts.corDoTexto?.(n) ?? INK;
    for (const [i, col] of colunas.entries()) {
      const w = larguras[i] ?? 0;
      const bruto = linha[i] ?? "";
      let texto = bruto;
      // Mede antes de escrever: texto cortado é melhor que texto invadindo a
      // coluna seguinte, que é o que faz a tabela inteira parecer quebrada.
      while (texto.length > 1 && doc.textWidth(texto, 7, "regular") > w - 12) {
        texto = `${texto.slice(0, -2)}…`;
      }
      const tx = col.alinharADireita ? x + w - 6 - doc.textWidth(texto, 7, "regular") : x + 6;
      doc.drawText(texto, tx, y + 9.5, { size: 7, color: i === 0 ? cor : INK_2 });
      x += w;
    }
    doc.y += alturaLinha;
  }
  doc.moveDown(4);
}

/* -------------------------------------------------------------- montagem -- */

export function gerarRelatorioSetorPdf(input: SectorReportInput): ArrayBuffer {
  const doc = new PdfDocument({
    title: `Progresso do setor ${input.sectorLabel}`,
    author: "Build.Connect",
    marginTop: 48,
    marginBottom: 56,
  });

  /*
   * Rodapé em TODA página, e não só na primeira: o relatório pode levar
   * documentação pessoal, então a folha solta que alguém esquece na impressora
   * precisa dizer de quando é e de quem foi o pedido.
   */
  doc.onPageStart = (d, pagina) => {
    d.rect(d.marginX, d.height - 44, d.contentWidth, 0.5, LINHA);
    d.drawText(
      `${input.sectorLabel} · gerado em ${input.generatedAtLabel} por ${input.requestedByName} · página ${pagina}`,
      d.marginX,
      d.height - 32,
      { size: 7, color: INK_2 },
    );
  };
  doc.onPageStart(doc, 1);

  // ── Capa: título e os quatro indicadores do topo da tela ──────────────────
  doc.text("Progresso dos colaboradores", { size: 17, font: "bold", color: INK });
  doc.text(input.sectorLabel, { size: 11, color: INK_2, spacing: 12 });

  const gap = 10;
  const larguraCard = (doc.contentWidth - gap * 3) / 4;
  const yCards = doc.y;
  kpiCard(doc, doc.marginX, yCards, larguraCard, 50, {
    label: "Progresso do setor",
    value: `${input.progress}%`,
    cor: SERIE_PROGRESSO,
    progresso: input.progress,
  });
  kpiCard(doc, doc.marginX + larguraCard + gap, yCards, larguraCard, 50, {
    label: "Média do setor",
    value: mediaLabel(input.average),
    hint: "só notas aprovadas",
    cor: input.average === null ? INK_2 : SERIE_MEDIA,
  });
  kpiCard(doc, doc.marginX + (larguraCard + gap) * 2, yCards, larguraCard, 50, {
    label: "Colaboradores",
    value: String(input.memberCount),
    hint: "no setor",
  });
  kpiCard(doc, doc.marginX + (larguraCard + gap) * 3, yCards, larguraCard, 50, {
    label: "Reprovações",
    value: String(input.rejections),
    hint: input.rejections === 0 ? "nenhuma" : "notas abaixo de 7",
    cor: input.rejections > 0 ? ALERTA : INK,
  });
  doc.y = yCards + 50;
  doc.moveDown(18);

  if (input.members.length === 0) {
    doc.text("Nenhum colaborador lotado neste setor.", { size: 9, color: INK_2 });
    return doc.toArrayBuffer();
  }

  // ── Os dois gráficos: uma grandeza em cada, nunca dois eixos num só ───────
  graficoDeBarras(doc, {
    titulo: "Consumo de conteúdo",
    subtitulo: "Percentual do material do setor já concluído, por colaborador.",
    linhas: input.members.map((e) => ({
      label: e.member.name,
      value: e.member.progress,
      valueLabel: `${e.member.progress}%`,
    })),
    max: 100,
    cor: SERIE_PROGRESSO,
    vazio: "Sem colaboradores para comparar.",
  });

  graficoDeBarras(doc, {
    titulo: "Média nas avaliações de vídeo",
    subtitulo: "Escala de 0 a 10, só com as notas aprovadas. Travessão = nenhuma nota aprovada.",
    linhas: input.members.map((e) => ({
      label: e.member.name,
      // Nulo não vira zero: quem ainda não tem nota aprovada não é "péssimo".
      value: e.member.average,
      valueLabel: e.member.average === null ? "— sem nota" : `${mediaLabel(e.member.average)}/10`,
    })),
    max: 10,
    cor: SERIE_MEDIA,
    vazio: "Sem colaboradores para comparar.",
  });

  // ── Um bloco por colaborador ──────────────────────────────────────────────
  for (const entry of input.members) {
    const { member } = entry;

    /*
     * Cada pessoa começa em bloco inteiro quando possível: um nome no pé de
     * uma página com os dados na seguinte é o relatório que se lê errado.
     */
    doc.moveDown(10);
    doc.ensureSpace(190);

    const yFaixa = doc.y;
    doc.roundedRect(doc.marginX, yFaixa, doc.contentWidth, 22, 5, PAINEL);
    doc.drawText(member.name, doc.marginX + 10, yFaixa + 15, {
      size: 11,
      font: "bold",
      color: INK,
    });
    const larguraNome = doc.textWidth(member.name, 11, "bold");
    doc.drawText(member.role, doc.marginX + 16 + larguraNome, yFaixa + 15, {
      size: 7.5,
      color: INK_2,
    });
    doc.y = yFaixa + 22;
    doc.moveDown(10);

    // Avanço, em barra: o número e a forma juntos.
    const yBarra = doc.y;
    doc.drawText("Consumo de conteúdo", doc.marginX + 10, yBarra + 7, {
      size: 7,
      font: "bold",
      color: INK_2,
    });
    const rotuloProgresso = `${member.progress}% · ${member.doneItems} de ${member.totalItems} itens`;
    doc.drawText(
      rotuloProgresso,
      doc.marginX + doc.contentWidth - doc.textWidth(rotuloProgresso, 7, "bold"),
      yBarra + 7,
      { size: 7, font: "bold", color: INK },
    );
    barraDeProgresso(doc, doc.marginX + 10, yBarra + 11, doc.contentWidth - 10, 6, member.progress, SERIE_PROGRESSO);
    doc.y = yBarra + 22;

    // Indicadores da pessoa, na mesma gramática dos do setor.
    const gapM = 8;
    const larguraM = (doc.contentWidth - 10 - gapM * 3) / 4;
    const yM = doc.y;
    kpiCard(doc, doc.marginX + 10, yM, larguraM, 42, {
      label: "Cadastro",
      value: member.sinceLabel,
      hint: "data de cadastro",
    });
    kpiCard(doc, doc.marginX + 10 + larguraM + gapM, yM, larguraM, 42, {
      label: "Média de vídeo",
      value: member.average === null ? "—" : `${mediaLabel(member.average)}/10`,
      hint: member.average === null ? "nenhuma aprovada" : "só notas aprovadas",
      cor: member.average === null ? INK_2 : SERIE_MEDIA,
    });
    kpiCard(doc, doc.marginX + 10 + (larguraM + gapM) * 2, yM, larguraM, 42, {
      label: "Reprovações",
      value: String(member.rejections),
      hint: member.rejections === 0 ? "nenhuma" : "notas abaixo de 7",
      cor: member.rejections > 0 ? ALERTA : INK,
    });
    kpiCard(doc, doc.marginX + 10 + (larguraM + gapM) * 3, yM, larguraM, 42, {
      label: "Pendências",
      value: String(member.pending),
      hint: member.pending === 0 ? "conteúdo em dia" : "itens a concluir",
      cor: member.pending > 0 ? ALERTA : INK,
    });
    doc.y = yM + 42;

    // ── Cadastro ────────────────────────────────────────────────────────────
    secao(doc, "Cadastro");
    tabela(
      doc,
      [
        { titulo: "Campo", fr: 0.28 },
        { titulo: "Valor", fr: 0.72 },
      ],
      [
        ["Usuário", entry.username],
        ["Telefone", telefoneLabel(entry.phone)],
        ["Unidade", entry.unitLabel ?? "—"],
        [
          "Subsetores",
          entry.subsectorLabels.length > 0
            ? entry.subsectorLabels.join(", ")
            : "todos do setor (sem marcação)",
        ],
      ],
    );

    // ── Histórico de avaliações ─────────────────────────────────────────────
    const totalHistorico = member.evaluations.length + member.performance.length;
    secao(doc, `Histórico de avaliações (${totalHistorico})`);

    if (totalHistorico === 0) {
      doc.text("Nenhuma avaliação registrada.", { size: 7.5, color: INK_2, indent: 16 });
    }

    if (member.evaluations.length > 0) {
      doc.text(`Compreensão de vídeo · ${member.evaluations.length}`, {
        size: 7.5,
        font: "bold",
        color: INK,
        indent: 10,
        spacing: 3,
      });
      tabela(
        doc,
        [
          { titulo: "Vídeo", fr: 0.52 },
          { titulo: "Data", fr: 0.2 },
          { titulo: "Nota", fr: 0.14, alinharADireita: true },
          { titulo: "Situação", fr: 0.14, alinharADireita: true },
        ],
        member.evaluations.map((e) => [
          e.videoTitle,
          e.attempt > 1 ? `${e.gradedAtLabel} · t${e.attempt}` : e.gradedAtLabel,
          `${e.grade}/10`,
          // A palavra, sempre: no preto e branco a cor não sobrevive.
          e.passed ? "Aprovada" : "Reprovada",
        ]),
        { corDoTexto: (i) => (member.evaluations[i]?.passed ? INK : ALERTA) },
      );
    }

    if (member.performance.length > 0) {
      doc.text(`Desempenho · ${member.performance.length}`, {
        size: 7.5,
        font: "bold",
        color: INK,
        indent: 10,
        spacing: 3,
      });
      tabela(
        doc,
        [
          { titulo: "Instrumento", fr: 0.4 },
          { titulo: "Avaliador", fr: 0.26 },
          { titulo: "Data", fr: 0.18 },
          { titulo: "Pontos", fr: 0.16, alinharADireita: true },
        ],
        member.performance.map((p) => [
          p.cycleLabel ? `${p.title} · ${p.cycleLabel}` : p.title,
          p.selfAssessment ? "autoavaliação" : p.evaluatorName,
          p.createdAtLabel,
          p.total === null
            ? "—"
            : `${p.total}${p.maxTotal === null ? "" : `/${p.maxTotal}`}`,
        ]),
      );
    }

    if (member.evaluationGaps.length > 0) {
      doc.ensureSpace(16);
      iconeAlerta(doc, doc.marginX + 10, doc.y + 1, ALERTA);
      doc.drawText(`Nunca aplicadas · ${member.evaluationGaps.length}`, doc.marginX + 21, doc.y + 7, {
        size: 7.5,
        font: "bold",
        color: ALERTA,
      });
      doc.y += 12;
      tabela(
        doc,
        [
          { titulo: "Instrumento", fr: 0.62 },
          { titulo: "Quem aplica", fr: 0.38, alinharADireita: true },
        ],
        member.evaluationGaps.map((g) => [
          g.typeTitle,
          g.multiRater ? "rodada do DHO" : "gestor do setor",
        ]),
        { corDoTexto: () => ALERTA },
      );
    }

    // ── Departamento Pessoal ────────────────────────────────────────────────
    secao(doc, `Departamento Pessoal (${member.personnelFiles})`);

    if (entry.folders === null) {
      doc.ensureSpace(16);
      iconeAlerta(doc, doc.marginX + 10, doc.y + 1, INK_2);
      doc.drawText(
        "Documentação fora do seu alcance — não incluída neste relatório.",
        doc.marginX + 21,
        doc.y + 7,
        { size: 7.5, color: INK_2 },
      );
      doc.y += 14;
    } else if (entry.folders.length === 0) {
      doc.text("Nenhuma pasta criada para este colaborador.", {
        size: 7.5,
        color: INK_2,
        indent: 16,
      });
    } else {
      for (const grupo of entry.folders) {
        doc.ensureSpace(16);
        iconeDocumento(doc, doc.marginX + 10, doc.y + 1, INK_2);
        doc.drawText(grupo.label, doc.marginX + 21, doc.y + 7, {
          size: 7.5,
          font: "bold",
          color: INK,
        });
        doc.y += 12;

        /*
         * Pasta VAZIA aparece, como no modal da tela: o que falta é
         * justamente o que o gestor abriu o relatório para ver — uma lista só
         * do que existe esconderia o ASO que nunca chegou.
         */
        const faltando = grupo.folders.map(
          (p) => p.status === "pendente" || p.status === "vencido",
        );
        tabela(
          doc,
          [
            { titulo: "Pasta", fr: 0.36 },
            { titulo: "Arquivo", fr: 0.42 },
            { titulo: "Situação", fr: 0.22, alinharADireita: true },
          ],
          grupo.folders.map((p) => [
            p.label,
            p.files.length === 0
              ? "—"
              : p.files.map((a) => `${a.name} (${a.kind}, ${a.size})`).join(" · "),
            folderStatusLabel(p.status, p.expiresOn, p.files.length),
          ]),
          { corDoTexto: (i) => (faltando[i] ? ALERTA : INK) },
        );
      }
    }

    // Fecho do bloco: a régua separa pessoas, não seções.
    doc.moveDown(2);
    doc.hr(LINHA);
  }

  // Um visto no fim, para a última página não terminar no ar.
  doc.moveDown(10);
  doc.ensureSpace(14);
  iconeVisto(doc, doc.marginX, doc.y + 1, INK_2);
  doc.drawText(
    `Fim do relatório · ${input.members.length} ${input.members.length === 1 ? "colaborador" : "colaboradores"}`,
    doc.marginX + 13,
    doc.y + 7,
    { size: 7, color: INK_2 },
  );

  return doc.toArrayBuffer();
}
