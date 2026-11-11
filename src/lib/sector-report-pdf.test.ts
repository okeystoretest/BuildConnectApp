import assert from "node:assert/strict";
import test from "node:test";
import {
  gerarRelatorioSetorPdf,
  nomeCurto,
  type SectorReportInput,
  type SectorReportMember,
} from "./sector-report-pdf";
import type { MemberOverview } from "./sector-overview";
import type { PersonnelFolderGroup } from "@/types/hr";

/**
 * Contrato do relatório do "Meu Setor".
 *
 * Não tenta conferir o DESENHO — o texto das páginas sai deflacionado dentro
 * do PDF, e afirmar posição de linha travaria qualquer ajuste de layout. O que
 * se guarda aqui é o que quebra silenciosamente: arquivo que não abre, bloco
 * que some, e o caso "fora do alcance", que é o único com consequência de
 * privacidade.
 */

function membro(over: Partial<MemberOverview> = {}): MemberOverview {
  return {
    userId: "u1",
    name: "Ana Souza",
    role: "Colaborador",
    sinceLabel: "01/02/2026",
    doneItems: 3,
    totalItems: 10,
    progress: 30,
    average: 8.5,
    rejections: 1,
    pending: 7,
    pendingList: [],
    evaluations: [
      {
        id: "g1",
        videoTitle: "Abertura de caixa",
        grade: 9,
        attempt: 1,
        gradedAtLabel: "10/03/2026",
        passed: true,
      },
      {
        id: "g2",
        videoTitle: "Atendimento ao cliente",
        grade: 4,
        attempt: 2,
        gradedAtLabel: "12/03/2026",
        passed: false,
      },
    ],
    performance: [
      {
        id: "p1",
        title: "Acompanhamento Pré-Efetivo",
        total: 34,
        maxTotal: 40,
        cycleLabel: "Ciclo 1",
        evaluatorName: "Bruno Lima",
        selfAssessment: false,
        createdAtLabel: "15/03/2026",
      },
    ],
    evaluationGaps: [
      { typeId: "t9", typeSlug: "matriz-de-decisao", typeTitle: "Matriz de Decisão", multiRater: true },
      { typeId: "t8", typeSlug: "comportamental", typeTitle: "Comportamental", multiRater: false },
    ],
    personnelFiles: 2,
    ...over,
  };
}

const PASTAS: PersonnelFolderGroup[] = [
  {
    key: "admissional",
    label: "Admissional",
    folders: [
      {
        key: "aso",
        label: "ASO",
        status: "pendente",
        fixed: true,
        expiresOn: null,
        files: [],
      },
      {
        key: "rg",
        label: "RG",
        status: "ok",
        fixed: true,
        expiresOn: null,
        files: [
          { id: "f1", name: "rg-frente.pdf", kind: "PDF", size: "120 KB", filePath: "/x.pdf" },
        ],
      },
    ],
  },
];

function entrada(over: Partial<SectorReportInput> = {}): SectorReportInput {
  const base: SectorReportMember = {
    member: membro(),
    username: "ana#BC",
    phone: "11987654321",
    unitLabel: "Matriz",
    subsectorLabels: ["Vendas"],
    folders: PASTAS,
  };
  return {
    sectorLabel: "Operações",
    requestedByName: "Carla Dias",
    generatedAtLabel: "10/11/2026 às 09:30",
    progress: 42,
    average: 7.9,
    memberCount: 1,
    rejections: 3,
    members: [base],
    ...over,
  };
}

/** O PDF como bytes latin1, para procurar as partes NÃO comprimidas. */
function bytes(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("latin1");
}

test("gera um PDF válido: cabeçalho e fim de arquivo", () => {
  const out = bytes(gerarRelatorioSetorPdf(entrada()));
  assert.ok(out.startsWith("%PDF-1.4"), "sem cabeçalho de PDF");
  assert.ok(out.trimEnd().endsWith("%%EOF"), "sem marcador de fim");
  assert.ok(out.includes("/Type /Page"), "nenhuma página no documento");
});

test("setor sem colaborador ainda produz um arquivo que abre", () => {
  const out = bytes(gerarRelatorioSetorPdf(entrada({ members: [], memberCount: 0 })));
  assert.ok(out.startsWith("%PDF-1.4"));
  assert.ok(out.trimEnd().endsWith("%%EOF"));
});

test("média nula não derruba a montagem", () => {
  // `null` não é zero: é "nenhuma nota aprovada", e o relatório imprime
  // travessão. Um `toLocaleString` em null quebraria a rota inteira.
  const out = bytes(
    gerarRelatorioSetorPdf(
      entrada({ average: null, members: [{ ...entrada().members[0]!, member: membro({ average: null }) }] }),
    ),
  );
  assert.ok(out.trimEnd().endsWith("%%EOF"));
});

test("cadastro antigo sem telefone nem unidade não quebra", () => {
  const um = entrada().members[0]!;
  const out = bytes(
    gerarRelatorioSetorPdf(
      entrada({
        members: [{ ...um, phone: undefined, unitLabel: undefined, subsectorLabels: [] }],
      }),
    ),
  );
  assert.ok(out.trimEnd().endsWith("%%EOF"));
});

/*
 * O caso que mais importa. `null` = o pedinte não alcança a documentação
 * daquela pessoa; `[]` = alcança e não há pasta nenhuma. Se os dois gerassem o
 * MESMO arquivo, seria sinal de que o ramo do alcance deixou de ser
 * respeitado — e o relatório diria "nenhuma pasta" a quem só não tem acesso.
 */
test("documentação fora do alcance sai diferente de documentação vazia", () => {
  const um = entrada().members[0]!;
  const fora = bytes(gerarRelatorioSetorPdf(entrada({ members: [{ ...um, folders: null }] })));
  const vazia = bytes(gerarRelatorioSetorPdf(entrada({ members: [{ ...um, folders: [] }] })));
  assert.notEqual(fora.length, vazia.length);
});

test("muitos colaboradores paginam em vez de transbordar a folha", () => {
  const um = entrada().members[0]!;
  const muitos = Array.from({ length: 12 }, (_, i) => ({
    ...um,
    member: membro({ userId: `u${i}`, name: `Colaborador ${i}` }),
  }));
  const out = bytes(gerarRelatorioSetorPdf(entrada({ members: muitos, memberCount: 12 })));
  const paginas = out.split("/Type /Page").length - 1;
  assert.ok(paginas > 1, `esperava mais de uma página, veio ${paginas}`);
});

/*
 * O rótulo do gráfico de barras tem largura fixa. Nome que não cabe precisa
 * encurtar de forma PREVISÍVEL — cortar no meio de um sobrenome faria duas
 * pessoas da mesma família virarem o mesmo rótulo.
 */
test("nome curto preserva quem cabe", () => {
  assert.equal(nomeCurto("Ana Souza"), "Ana Souza");
});

test("nome longo vira primeiro nome + inicial do último", () => {
  assert.equal(nomeCurto("João Gonçalves de Albuquerque"), "João A.");
  assert.equal(nomeCurto("Maria de Lourdes Ótima"), "Maria Ó.");
});

test("nome único e longo é cortado com reticências, nunca estourado", () => {
  const saida = nomeCurto("Bartolomeuzinhodasilva", 12);
  assert.ok(saida.length <= 12, saida);
  assert.ok(saida.endsWith("…"));
});

test("o gráfico de zero não desenha barra, mas o PDF continua válido", () => {
  // O zero é o caso que mais errou na amostra: uma lasca de barra lia como
  // "já começou". Aqui só se garante que o documento sai inteiro.
  const um = entrada().members[0]!;
  const out = bytes(
    gerarRelatorioSetorPdf(
      entrada({ members: [{ ...um, member: membro({ progress: 0, doneItems: 0 }) }] }),
    ),
  );
  assert.ok(out.trimEnd().endsWith("%%EOF"));
});
