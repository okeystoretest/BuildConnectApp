import assert from "node:assert/strict";
import test from "node:test";
import { sectorDocsFlag, withoutFilePaths } from "./personnel-visibility";
import type { PersonnelFolderGroup } from "@/types/hr";

/**
 * As duas regras puras que cercam a documentação pessoal.
 *
 * São testadas juntas porque respondem à mesma pergunta por dois ângulos: quem PODE (a permissão só existe para Gestor) e o
 * que SAI (o caminho do arquivo não viaja para quem não baixa). Qualquer uma
 * das duas falhando entrega documento a quem não devia, sem erro na tela.
 */

function grupos(): PersonnelFolderGroup[] {
  return [
    {
      key: "saude",
      label: "Saúde",
      folders: [
        {
          key: "aso",
          label: "ASO",
          fixed: true,
          expiresOn: "2026-11-02",
          status: "cuidado",
          files: [
            {
              id: "f1",
              name: "aso.pdf",
              size: "1,2 MB",
              kind: "PDF",
              filePath: "/uploads/pessoal/2026/10/segredo.pdf",
            },
          ],
        },
        { key: "exames", label: "Exames", fixed: true, expiresOn: null, status: "pendente", files: [] },
      ],
    },
  ];
}

test("a permissão de documentos só vale para GESTOR", () => {
  assert.equal(sectorDocsFlag("GESTOR", true), true);
  assert.equal(sectorDocsFlag("GESTOR", false), false);
  // Rebaixar tem de retirar o acesso junto, e não deixá-lo dormente.
  assert.equal(sectorDocsFlag("COLABORADOR", true), false);
  // O Admin alcança por outro caminho (canAdministerDho); a coluna não é dele.
  assert.equal(sectorDocsFlag("ADMIN", true), false);
});

test("withoutFilePaths apaga o caminho e preserva o resto", () => {
  const limpo = withoutFilePaths(grupos());
  const arquivo = limpo[0]!.folders[0]!.files[0]!;

  assert.equal(arquivo.filePath, "", "o caminho não viaja");
  // O que a tela usa continua inteiro: o visor abre pelo ID, e o rótulo da
  // pasta depende da contagem e do vencimento.
  assert.equal(arquivo.id, "f1");
  assert.equal(arquivo.name, "aso.pdf");
  assert.equal(arquivo.size, "1,2 MB");
  assert.equal(limpo[0]!.folders[0]!.status, "cuidado");
  assert.equal(limpo[0]!.folders[0]!.expiresOn, "2026-11-02");
  assert.equal(limpo[0]!.folders[1]!.files.length, 0, "pasta vazia continua vazia");
});

test("withoutFilePaths não altera o original", () => {
  const original = grupos();
  withoutFilePaths(original);
  assert.equal(
    original[0]!.folders[0]!.files[0]!.filePath,
    "/uploads/pessoal/2026/10/segredo.pdf",
    "a cópia do DHO não pode ser apagada junto",
  );
});

test("nenhum caminho sobra em acervo de vários grupos e pastas", () => {
  const muitos: PersonnelFolderGroup[] = [
    ...grupos(),
    {
      key: "outras",
      label: "Outras pastas",
      folders: [
        {
          key: "contratos",
          label: "Contratos",
          fixed: false,
          expiresOn: null,
          status: "ok",
          files: [
            { id: "f2", name: "a.pdf", size: "1 KB", kind: "PDF", filePath: "/uploads/pessoal/a.pdf" },
            { id: "f3", name: "b.docx", size: "2 KB", kind: "DOCX", filePath: "/uploads/pessoal/b.docx" },
          ],
        },
      ],
    },
  ];

  const caminhos = withoutFilePaths(muitos)
    .flatMap((g) => g.folders)
    .flatMap((f) => f.files)
    .map((f) => f.filePath);
  assert.deepEqual(caminhos, ["", "", ""]);
});
