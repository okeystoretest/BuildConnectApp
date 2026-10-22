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
  label: string;
  categories: readonly PersonnelCategory[];
}

export const PERSONNEL_GROUPS: readonly PersonnelGroup[] = [
  {
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
    label: "Saúde e segurança do trabalho",
    categories: [
      { key: "aso", label: "ASO (admissional, periódico, demissional, retorno)" },
      { key: "atestados-medicos", label: "Atestados médicos e licenças" },
    ],
  },
  {
    label: "Desempenho e comportamento",
    categories: [
      { key: "perfil-comportamental", label: "Perfil comportamental (DISC)" },
      { key: "avaliacoes-desempenho", label: "Avaliações de desempenho e feedback" },
    ],
  },
] as const;

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
 * Recusa o nome de pasta extra que colidiria com o catálogo fixo, por chave ou
 * por rótulo. Sem isso, uma pasta "ASO" criada à mão apareceria duas vezes e os
 * arquivos se dividiriam entre as duas, sem que ninguém entendesse por quê.
 */
export function collidesWithCatalog(name: string): boolean {
  const lowered = name.toLowerCase();
  return PERSONNEL_GROUPS.some((g) =>
    g.categories.some(
      (c) => c.key.toLowerCase() === lowered || c.label.toLowerCase() === lowered,
    ),
  );
}
