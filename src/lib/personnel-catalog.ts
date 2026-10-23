/**
 * Catálogo de pastas do Departamento Pessoal.
 *
 * As pastas obrigatórias são CONSTANTE, não linha de banco: toda pessoa ativa
 * tem exatamente as mesmas, e gravar as 11 por colaborador seria replicar
 * esta lista em cada cadastro — além de deixar duas verdades sobre quais
 * pastas existem. As pastas extra ("Adicionar mais pastas") são as únicas
 * persistidas, em `User.personnelFolders`.
 *
 * A `key` é o que vai para `PersonnelFile.folder` e NUNCA muda: mudar a chave
 * órfãna os arquivos já arquivados. O `label` é só rótulo e pode ser reescrito
 * à vontade.
 */

export interface PersonnelCategory {
  key: string;
  label: string;
}

export interface PersonnelGroup {
  /** Identidade do bloco. O rótulo é renomeável; esta chave não muda nunca. */
  key: string;
  label: string;
  categories: readonly PersonnelCategory[];
}

export const PERSONNEL_GROUPS: readonly PersonnelGroup[] = [
  {
    key: "admissionais",
    label: "Admissionais e contratuais",
    categories: [
      { key: "docs-pessoais", label: "Documentos pessoais (RG, CPF, CNH, Passaporte)" },
      { key: "comprovante-residencia", label: "Comprovante de residência" },
      { key: "ctps", label: "Carteira de Trabalho (CTPS)" },
      { key: "eleitor-reservista", label: "Título de eleitor e certificado de reservista" },
      { key: "escolaridade", label: "Comprovante de escolaridade" },
      { key: "certidoes", label: "Certidões (casamento, nascimento de dependentes)" },
      { key: "dados-bancarios", label: "Dados bancários para folha" },
    ],
  },
  {
    key: "saude",
    label: "Saúde e segurança do trabalho",
    categories: [
      { key: "aso", label: "ASO (admissional, periódico, demissional, retorno)" },
      { key: "atestados-medicos", label: "Atestados médicos e licenças" },
    ],
  },
  {
    key: "desempenho",
    label: "Desempenho e comportamento",
    categories: [
      { key: "perfil-comportamental", label: "Perfil comportamental (DISC)" },
      { key: "avaliacoes-desempenho", label: "Avaliações de desempenho e feedback" },
    ],
  },
] as const;

/**
 * O bloco das pastas criadas à mão. Não sai do catálogo — é montado na
 * leitura — mas tem chave como os outros, para poder ser renomeado igual.
 */
export const OTHERS_GROUP_KEY = "outras";
export const OTHERS_GROUP_LABEL = "Outras pastas";

/** As chaves obrigatórias, achatadas — toda pasta que existe para todo mundo. */
export const PERSONNEL_CATEGORY_KEYS: readonly string[] = PERSONNEL_GROUPS.flatMap((g) =>
  g.categories.map((c) => c.key),
);

/** Rótulo de uma pasta fixa; `null` quando a chave não é do catálogo. */
export function categoryLabel(key: string): string | null {
  for (const group of PERSONNEL_GROUPS) {
    const found = group.categories.find((c) => c.key === key);
    if (found) return found.label;
  }
  return null;
}

/**
 * Normaliza o nome de uma pasta extra digitada pelo Gestor.
 *
 * Colapsa espaços e corta em 60 — o nome é a CHAVE da pasta (vai para
 * `PersonnelFile.folder`), então " ASO " e "ASO" não podem virar duas pastas
 * diferentes na tela.
 */
export function normalizeFolderName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * A chave do catálogo que este nome designa — por chave ou por rótulo, sem
 * diferenciar maiúsculas. `null` quando o nome não é de nenhuma pasta modelo.
 *
 * Serve a dois usos opostos: recusar uma pasta à mão que duplicaria uma do
 * catálogo (os arquivos se dividiriam entre as duas), e RECONHECER o nome de
 * uma pasta modelo que foi excluída, para restaurá-la em vez de recusar.
 */
export function catalogKeyByName(name: string): string | null {
  const lowered = name.toLowerCase();
  for (const group of PERSONNEL_GROUPS) {
    const found = group.categories.find(
      (c) => c.key.toLowerCase() === lowered || c.label.toLowerCase() === lowered,
    );
    if (found) return found.key;
  }
  return null;
}

/** Atalho de leitura sobre `catalogKeyByName`. */
export function collidesWithCatalog(name: string): boolean {
  return catalogKeyByName(name) !== null;
}
