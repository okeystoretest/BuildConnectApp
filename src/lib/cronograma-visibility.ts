import type { Role } from "@/types";
import type { ContentVisibility } from "@/types/cronograma";

/**
 * Regra de alcance do Cronograma — ponto único.
 *
 * Marketing, Vendas e Criação compartilham a MESMA base (`appsSource`), então
 * o subsetor do registro não distingue nada: quem separa é `originSlug`, a
 * aba em que o card foi criado, combinada com o alcance escolhido no
 * formulário:
 *
 * - SHARED  "Público"    → aparece nas três abas.
 * - SECTOR  "Setor"      → aparece só na aba de origem, para TODOS os
 *                          usuários dela.
 * - PRIVATE "Somente eu" → só o autor.
 *
 * Admin enxerga tudo, para poder corrigir e organizar a agenda do time.
 *
 * A decisão em forma pura (`canViewInTab`) e a cláusula que a consulta manda
 * ao banco (`visibilityWhere`) moram AQUI, lado a lado e cobertas pelo mesmo
 * teste. Escritas em arquivos diferentes elas divergem, e divergir aqui não
 * dá erro: a tela passa a esconder o que o servidor entregou, ou o contrário.
 */

/** Ordem de exibição dos botões no formulário — do mais aberto ao mais restrito. */
export const VISIBILITY_ORDER: readonly ContentVisibility[] = ["SHARED", "SECTOR", "PRIVATE"];

/** Abas cujo conteúdo NASCE público. As demais nascem restritas ao autor. */
const PUBLIC_BY_DEFAULT: readonly string[] = ["marketing", "criacao"];

/**
 * Alcance pré-selecionado ao abrir o formulário na aba `slug`.
 *
 * É só o padrão — quem cria escolhe. Ele reproduz o que cada aba já fazia
 * antes dos botões existirem, para que nada mude de alcance por omissão.
 */
export function defaultVisibilityForSlug(slug: string): ContentVisibility {
  return PUBLIC_BY_DEFAULT.includes(slug) ? "SHARED" : "PRIVATE";
}

/** O que a regra precisa saber de um card. */
export interface PostScope {
  visibility: ContentVisibility;
  /** Aba onde foi criado. Nulo em registros anteriores ao campo. */
  originSlug: string | null;
  createdById: string | null;
}

export interface Viewer {
  id: string;
  role: Role;
}

/** Este card aparece para `viewer` quando ele está olhando a aba `slug`? */
export function canViewInTab(post: PostScope, viewer: Viewer, slug: string): boolean {
  if (viewer.role === "ADMIN") return true;
  // O autor nunca perde o próprio card de vista, seja qual for o alcance.
  if (post.createdById !== null && post.createdById === viewer.id) return true;
  if (post.visibility === "SHARED") return true;
  if (post.visibility === "SECTOR") return post.originSlug === slug;
  return false;
}

/**
 * O MESMO recorte, em cláusula de consulta. O filtro é aplicado no banco, e
 * não na UI: o que não pode ser visto nem chega ao cliente.
 */
export function visibilityWhere(slug: string, viewer: Viewer) {
  if (viewer.role === "ADMIN") return {};
  return {
    OR: [
      { visibility: "SHARED" as const },
      { visibility: "SECTOR" as const, originSlug: slug },
      { createdById: viewer.id },
    ],
  };
}

export const VISIBILITY_LABEL: Record<ContentVisibility, string> = {
  SHARED: "Público",
  SECTOR: "Setor",
  PRIVATE: "Somente eu",
};

/** Frase curta sob cada botão do formulário. */
export const VISIBILITY_SHORT: Record<ContentVisibility, string> = {
  SHARED: "Marketing, Vendas e Criação",
  SECTOR: "Todos deste setor",
  PRIVATE: "Só você",
};

export const VISIBILITY_HINT: Record<ContentVisibility, string> = {
  SHARED:
    "Atividade pública: aparece no calendário de Marketing, Vendas e Criação. Apenas o autor pode alterá-la.",
  SECTOR:
    "Atividade do setor: aparece para todos os usuários da aba em que foi criada, e não para os outros setores. Apenas o autor pode alterá-la.",
  PRIVATE: "Atividade pessoal: só quem criou consegue ver, editar ou excluir.",
};
