/**
 * Catálogo de pastas do Departamento Pessoal.
 *
 * As pastas obrigatórias são CONSTANTE, não linha de banco: toda pessoa ativa
 * tem exatamente as mesmas, e gravar as doze por colaborador seria replicar
 * esta lista em cada cadastro — além de deixar duas verdades sobre quais
 * pastas existem. As pastas extra ("Adicionar mais pastas") são as únicas
 * persistidas, em `User.personnelFolders`.
 *
 * A `key` é o que vai para `PersonnelFile.folder` e NUNCA muda: mudar a chave
 * órfãna os arquivos já arquivados. O `label` é só rótulo e pode ser reescrito
 * à vontade.
 *
 * Esta lista substituiu a primeira, de onze pastas temáticas, em 26/10/2026.
 * Três chaves foram mantidas de propósito — `ctps`, `comprovante-residencia` e
 * `dados-bancarios` designam o mesmo documento de antes, então os arquivos já
 * enviados continuam na pasta certa. As chaves que sumiram (`docs-pessoais`,
 * `eleitor-reservista`, `escolaridade`, `aso`, `atestados-medicos`,
 * `perfil-comportamental`, `avaliacoes-desempenho`) não são apagadas em lugar
 * nenhum: arquivo cuja pasta saiu do catálogo aparece em "Outras pastas" (ver
 * `getPersonnelFolders`), porque documento de colaborador não some de tela.
 */

export interface PersonnelCategory {
  key: string;
  label: string;
  /**
   * Fora do cálculo de progresso: não conta para "Completo" nem entra em
   * "Pendentes". Nem todo colaborador tem filho menor de 14 anos, e cobrar
   * dele uma certidão que não existe deixaria o painel permanentemente
   * vermelho para uma falta que não é falta.
   */
  optional?: boolean;
  /**
   * Validade em dias a partir do ENVIO, quando o documento vence por natureza.
   * O exame médico admissional vale um ano; a data é calculada no upload, em
   * vez de pedida ao DHO, porque ela não é escolha — é a regra do documento.
   */
  validityDays?: number;
}

export interface PersonnelGroup {
  /** Identidade do bloco. O rótulo é renomeável; esta chave não muda nunca. */
  key: string;
  label: string;
  categories: readonly PersonnelCategory[];
}

export const PERSONNEL_GROUPS: readonly PersonnelGroup[] = [
  {
    key: "documentos",
    label: "Documentação do colaborador",
    categories: [
      { key: "foto-3x4", label: "Fotos 3x4" },
      { key: "ctps", label: "Carteira de Trabalho" },
      {
        key: "exame-medico-admissional",
        label: "Exame Médico Admissional",
        validityDays: 365,
      },
      { key: "rg", label: "RG" },
      { key: "cpf", label: "CPF" },
      { key: "comprovante-residencia", label: "Comprovante de Residência" },
      { key: "titulo-eleitor", label: "Título de Eleitor" },
      { key: "nis-pis", label: "Cartão NIS/PIS" },
      { key: "certidao-nascimento-casamento", label: "Certidão de Nascimento ou Casamento" },
      {
        key: "certidao-filho-menor",
        label: "Certidão de Nascimento do Filho Menor de 14 anos",
        optional: true,
      },
      { key: "certidao-servico-militar", label: "Certidão de Serviço Militar" },
      { key: "dados-bancarios", label: "Dados Bancários", optional: true },
    ],
  },
] as const;

/**
 * O bloco das pastas criadas à mão. Não sai do catálogo — é montado na
 * leitura — mas tem chave como os outros, para poder ser renomeado igual.
 */
export const OTHERS_GROUP_KEY = "outras";
export const OTHERS_GROUP_LABEL = "Outras pastas";

/** As chaves do catálogo, achatadas — toda pasta que existe para todo mundo. */
export const PERSONNEL_CATEGORY_KEYS: readonly string[] = PERSONNEL_GROUPS.flatMap((g) =>
  g.categories.map((c) => c.key),
);

/** A categoria do catálogo, ou `null` quando a chave é de pasta extra. */
export function catalogCategory(key: string): PersonnelCategory | null {
  for (const group of PERSONNEL_GROUPS) {
    const found = group.categories.find((c) => c.key === key);
    if (found) return found;
  }
  return null;
}

/**
 * A pasta conta para o progresso?
 *
 * Pasta extra conta: foi o DHO que a criou para esta pessoa, então ele a
 * quer preenchida. Só as do catálogo marcadas `optional` ficam de fora.
 */
export function countsForProgress(key: string): boolean {
  return catalogCategory(key)?.optional !== true;
}

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
