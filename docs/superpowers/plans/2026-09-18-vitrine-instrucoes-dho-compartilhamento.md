# Vitrine, Instruções em Vídeo, DHO e Compartilhamento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar cinco requisições: (R2) Instruções em Vídeo em ordem alfabética; (R3) pílulas de filtro sempre visíveis, sem botão "Filtro"; (R4) Construtor de Formulários do DHO sem o conceito de "Seção"; (R1) aba "Material de Apoio" na Vitrine com suporte a `.pptx`; (R5) compartilhamento de um vídeo já enviado com outros subsetores, sem duplicar arquivo.

**Architecture:** Next.js 15 (App Router) + Prisma/Postgres + Server Actions. Todo arquivo enviado vive em disco sob `UPLOADS_DIR`; o banco guarda só o caminho público. Regras puras ficam em `src/lib/**` com testes `node:test`; telas em `src/components/**`. R4 troca `FormQuestion.sectionId` por `FormQuestion.formId` e derruba `FormSection` (migration com cópia de dados). R5 cria a tabela de junção `VideoShare(videoId, subsectorId)`: uma linha `Video`, um arquivo, N destinos.

**Tech Stack:** TypeScript, React 18, Next 15, Prisma 6, Tailwind, Zod, `node:test` via `tsx`.

**Spec:** Requisitos do usuário na conversa de 18/09/2026, com as decisões abaixo. Não há arquivo de spec separado — este plano é a fonte.

## Global Constraints

- Ordem de execução obrigatória: **Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11**. R4 (Tasks 3–5) e R5 (Tasks 9–11) só fecham com todas as suas tasks concluídas — uma task de schema sem a de código quebra o `typecheck`.
- Decisões fechadas com o usuário: só `ADMIN` compartilha vídeo, para qualquer subsetor; vídeo compartilhado **não** conta no progresso do destino; pílulas de filtro visíveis a **todos** os papéis; "Visualizar" abre PDF em nova aba, DOCX/PPTX só baixam; `FormSection` **sai do modelo** (não é escondida).
- Comentários e textos de interface em **português**, no tom dos arquivos existentes (explicam o *porquê*, não o *o quê*).
- Nunca binário no banco: só caminhos públicos `/uploads/...`.
- Antes de cada commit: `npm run typecheck && npm run lint && npm test` devem passar. `npm run test:db` exige Postgres local — rode quando a task tocar `core.dbtest.ts`.
- Migrations: criar a pasta `prisma/migrations/<timestamp>_<nome>/migration.sql` à mão (padrão do repo) e rodar `npx prisma migrate dev` localmente para aplicar + regenerar o client. Em produção o `docker-entrypoint.sh` aplica sozinho.
- Um commit por task, mensagem em português no estilo do `git log` (descreve o comportamento, não o arquivo). Terminar com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Não refatorar o que a task não pede.

---

## Mapa de arquivos

| Área | Arquivo | Responsabilidade |
|---|---|---|
| R2 | `src/lib/instrucoes-video.ts` (+ `.test.ts`) | Constante de página + `sortInstrucoes` (ordem alfabética pt-BR) |
| R2 | `src/lib/sector-data.ts` | Aplica a ordenação só aos vídeos `INSTRUCAO` |
| R3 | `src/components/sector/content-toolbar.tsx` | Sai o botão Filtro e as props dele |
| R3 | `src/components/sector/sector-page.tsx`, `src/components/it/it-sector-view.tsx` | Pílulas sempre renderizadas quando há tags |
| R4 | `prisma/schema.prisma`, `prisma/migrations/20260918100000_forms_drop_sections/` | `FormQuestion.formId`, fim de `FormSection` |
| R4 | `src/types/form.ts` | `FormDraft.questions`; some `FormSectionDraft` |
| R4 | `src/lib/forms/{core,data-core,response-core,actions,rules,validation,aggregate}.ts` + testes | Leem/gravam perguntas direto no formulário |
| R4 | `src/components/forms/form-builder.tsx`, `form-response-modal.tsx` | Lista plana de perguntas; resposta em página única |
| R1 | `prisma/schema.prisma`, `prisma/migrations/20260918110000_filekind_pptx/` | `FileKind.PPTX` |
| R1 | `src/lib/storage/files.ts`, `src/app/uploads/[...path]/route.ts`, `src/lib/sector-actions.ts` | Aceitar/servir/classificar `.ppt/.pptx` |
| R1 | `src/types/sector.ts`, `src/lib/sector-data.ts`, `src/components/sector/document-grid.tsx` | `DocumentItem.filePath`; botões Visualizar/Baixar funcionais |
| R1 | `src/components/sector/sector-page.tsx`, `src/components/sector/file-upload-modal.tsx` | Aba `material` na Vitrine; accept com `.pptx` |
| R5 | `prisma/schema.prisma`, `prisma/migrations/20260918120000_video_share/` | `VideoShare` |
| R5 | `src/lib/video-share.ts` (+ `.test.ts`) | Regra pura: mesclar próprios + compartilhados, sem duplicar; alvos elegíveis |
| R5 | `src/lib/sector-data.ts`, `src/types/sector.ts` | `VideoItem.sharedFrom`, `VideoItem.sharedWith` |
| R5 | `src/lib/sector-actions.ts` | `listVideoShareTargets`, shares dentro de `updateSectorVideo` |
| R5 | `src/components/sector/media-edit-modal.tsx`, `video-card.tsx`, `editable-media-actions.tsx` | Campo "Compartilhar com"; card do destino sem editar/excluir e com selo de origem |

---

### Task 1: R2 — Instruções em Vídeo em ordem alfabética

**Files:**
- Modify: `src/lib/instrucoes-video.ts`
- Create: `src/lib/instrucoes-video.test.ts`
- Modify: `src/lib/sector-data.ts:96-124`

**Interfaces:**
- Produces: `sortInstrucoes<T extends { title: string }>(videos: readonly T[]): T[]` — cópia ordenada por título, pt-BR, sem distinguir caixa/acento, numérica ("Vídeo 2" < "Vídeo 10").

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/instrucoes-video.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { sortInstrucoes } from "./instrucoes-video";

/**
 * Instruções em Vídeo listam em ordem alfabética por padrão (pedido de
 * 18/09/2026). A ordem de envio (`order`) deixa de mandar nesta aba.
 */

test("ordena por título, ignorando caixa e acento", () => {
  const sorted = sortInstrucoes([
    { title: "Órgãos de segurança" },
    { title: "abertura de caixa" },
    { title: "Empilhadeira" },
  ]);
  assert.deepEqual(
    sorted.map((v) => v.title),
    ["abertura de caixa", "Empilhadeira", "Órgãos de segurança"],
  );
});

test("números no título ordenam como números, não como texto", () => {
  const sorted = sortInstrucoes([{ title: "Módulo 10" }, { title: "Módulo 2" }, { title: "Módulo 1" }]);
  assert.deepEqual(sorted.map((v) => v.title), ["Módulo 1", "Módulo 2", "Módulo 10"]);
});

test("não muda a lista original", () => {
  const original = [{ title: "B" }, { title: "A" }];
  sortInstrucoes(original);
  assert.deepEqual(original.map((v) => v.title), ["B", "A"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/instrucoes-video.test.ts`
Expected: FAIL — `sortInstrucoes` não é exportada.

- [ ] **Step 3: Implementar**

Substituir o conteúdo de `src/lib/instrucoes-video.ts` por:

```ts
/**
 * Layout da ferramenta Instruções em Vídeo (setores padrão e Retaguarda):
 * 3 vídeos por linha, 3 linhas por página.
 */
export const INSTRUCOES_PAGE_SIZE = 9;

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/**
 * Ordem padrão da aba: alfabética pelo título (pedido de 18/09/2026).
 *
 * `sensitivity: "base"` iguala caixa e acento — "Órgãos" fica no O, não
 * depois do Z. `numeric` faz "Módulo 2" vir antes de "Módulo 10". Devolve
 * cópia: quem chama continua dono da lista original.
 */
export function sortInstrucoes<T extends { title: string }>(videos: readonly T[]): T[] {
  return [...videos].sort((a, b) => collator.compare(a.title, b.title));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/instrucoes-video.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Aplicar em `getSectorContent`**

Em `src/lib/sector-data.ts`, adicionar o import:

```ts
import { sortInstrucoes } from "@/lib/instrucoes-video";
```

E, logo após o laço `for (const v of sub.videos ...)` que separa `videos`/`workshops` (antes de `const photos`), inserir:

```ts
  // Instruções em Vídeo listam em ordem alfabética; Coleção e Workshop
  // (VIDEO) seguem a ordem de envio. O `kind` está no registro, não no item,
  // então a decisão é tomada aqui, onde ele ainda existe.
  const instrucoes = sub.kind === "PADRAO";
  const orderedVideos = instrucoes ? sortInstrucoes(videos) : videos;
```

E trocar `videos,` por `videos: orderedVideos,` no `return`.

Nota: nos subsetores PADRAO a aba "videos" só contém `INSTRUCAO` (VIDEO/INSTRUCAO caem na mesma lista e a Vitrine é a única que envia `VIDEO`). Se em algum momento um PADRAO tiver `VIDEO`, a ordenação alfabética também se aplica a ele — aceitável, é a mesma aba.

- [ ] **Step 6: Verificar e commitar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo passando.

```bash
git add src/lib/instrucoes-video.ts src/lib/instrucoes-video.test.ts src/lib/sector-data.ts
git commit -m "Instruções em Vídeo: ordem alfabética por padrão, ignorando caixa e acento

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: R3 — Pílulas de filtro sempre visíveis, sem botão "Filtro"

**Files:**
- Modify: `src/components/sector/content-toolbar.tsx`
- Modify: `src/components/sector/sector-page.tsx`
- Modify: `src/components/it/it-sector-view.tsx:68,105-110,155-181`

**Interfaces:**
- Produces: `ContentToolbarProps` sem `showFilter`, `filtersOpen`, `onToggleFilters`.

- [ ] **Step 1: Remover o botão da toolbar**

Em `src/components/sector/content-toolbar.tsx`:
- Import: `import { LayoutGrid, List, Search } from "lucide-react";` (sai `SlidersHorizontal`).
- Remover `import { useRole } from "@/providers/role-provider";`.
- Na interface, apagar as três props `showFilter`, `filtersOpen`, `onToggleFilters` e o comentário acima delas.
- Na assinatura da função, apagar `showFilter = false, filtersOpen = false, onToggleFilters,`.
- Apagar as linhas `const { can } = useRole();`, o comentário `// Filtro é ferramenta de gestão...` e `const canFilter = ...`.
- Apagar o bloco inteiro `{canFilter && ( <button ...>Filtro</button> )}`.

- [ ] **Step 2: Página de setor**

Em `src/components/sector/sector-page.tsx`:
- Apagar `const [filtersOpen, setFiltersOpen] = useState(false);`.
- Substituir a declaração de `filterBar` por:

```ts
  // As pílulas ficam sempre à vista (pedido de 18/09/2026): sem botão para
  // abri-las e sem restrição de papel. Sem tag em uso, não há nada a mostrar.
  const filterBar =
    filterable && filters.length > 0 ? (
      <FilterPills
        filters={filters}
        onChange={() => {}}
        active={activeFilters}
        onToggle={toggleFilter}
      />
    ) : null;
```

- No `<ContentToolbar>` das abas de vídeo, apagar as três linhas `showFilter={filterable}`, `filtersOpen={filtersOpen}`, `onToggleFilters={() => setFiltersOpen((v) => !v)}`.

- [ ] **Step 3: Página da TI**

Em `src/components/it/it-sector-view.tsx`:
- Apagar `const [filtersOpen, setFiltersOpen] = useState(false);`.
- No `<ContentToolbar>` da aba Instruções, apagar `showFilter`, `filtersOpen={filtersOpen}`, `onToggleFilters={() => setFiltersOpen((v) => !v)}`.
- Substituir o bloco `{filtersOpen && (filters.length > 0 ? (<FilterPills .../>) : (<p ...>Nenhum filtro ainda...</p>))}` por:

```tsx
            {filters.length > 0 && (
              <FilterPills
                filters={filters}
                onChange={() => {}}
                active={activeFilters}
                onToggle={toggleFilter}
              />
            )}
```

- [ ] **Step 4: Confirmar que nada mais usa as props**

Run: `grep -rn "showFilter\|filtersOpen\|onToggleFilters" src`
Expected: nenhuma linha.

- [ ] **Step 5: Verificar e commitar**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/components/sector/content-toolbar.tsx src/components/sector/sector-page.tsx src/components/it/it-sector-view.tsx
git commit -m "Instruções em Vídeo: sai o botão Filtro; as pílulas de tag ficam sempre à vista, para todos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: R4 — Schema e migration: pergunta liga direto ao formulário

**Files:**
- Modify: `prisma/schema.prisma:1154-1227`
- Create: `prisma/migrations/20260918100000_forms_drop_sections/migration.sql`
- Modify: `src/types/form.ts:66-90`

**Interfaces:**
- Produces: `FormQuestion.formId` (FK → `Form`, cascade), `Form.questions`. Tipo `FormDraft.questions: FormQuestionDraft[]`. `FormSectionDraft` deixa de existir.

- [ ] **Step 1: Schema**

Em `prisma/schema.prisma`, no `model Form`, trocar `sections    FormSection[]` por `questions   FormQuestion[]`.

Apagar o `model FormSection { ... }` inteiro.

No `model FormQuestion`, trocar:

```prisma
  sectionId String
  section   FormSection      @relation(fields: [sectionId], references: [id], onDelete: Cascade)
```
por
```prisma
  // Liga direto ao formulário. Seções saíram em 18/09/2026: o construtor do
  // DHO é uma lista única de perguntas, e a resposta é uma página só.
  formId    String
  form      Form             @relation(fields: [formId], references: [id], onDelete: Cascade)
```
e `@@index([sectionId, order])` por `@@index([formId, order])`.

- [ ] **Step 2: Migration com cópia de dados**

Criar `prisma/migrations/20260918100000_forms_drop_sections/migration.sql`:

```sql
-- Seções saem do Construtor de Formulários do DHO. A pergunta passa a ligar
-- direto ao formulário; a ordem global preserva "seção, depois pergunta" para
-- que formulários já publicados não embaralhem.

ALTER TABLE "FormQuestion" ADD COLUMN "formId" TEXT;

UPDATE "FormQuestion" q
SET "formId" = s."formId"
FROM "FormSection" s
WHERE q."sectionId" = s."id";

UPDATE "FormQuestion" q
SET "order" = ranked.rn
FROM (
  SELECT q2."id",
         ROW_NUMBER() OVER (PARTITION BY s."formId" ORDER BY s."order", q2."order") - 1 AS rn
  FROM "FormQuestion" q2
  JOIN "FormSection" s ON s."id" = q2."sectionId"
) ranked
WHERE ranked."id" = q."id";

ALTER TABLE "FormQuestion" ALTER COLUMN "formId" SET NOT NULL;

ALTER TABLE "FormQuestion" DROP CONSTRAINT "FormQuestion_sectionId_fkey";
DROP INDEX "FormQuestion_sectionId_order_idx";
ALTER TABLE "FormQuestion" DROP COLUMN "sectionId";

CREATE INDEX "FormQuestion_formId_order_idx" ON "FormQuestion"("formId", "order");
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "FormSection";
```

- [ ] **Step 3: Tipos**

Em `src/types/form.ts`, apagar a interface `FormSectionDraft` inteira e, em `FormDraft`, trocar `sections: FormSectionDraft[];` por `questions: FormQuestionDraft[];`.

- [ ] **Step 4: Aplicar migration e regenerar**

Run: `npx prisma migrate dev`
Expected: migration aplicada, client regenerado. Se o banco local usa `db push`, rodar `npx prisma db push` **e** conferir que `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --shadow-database-url $DATABASE_URL` não acusa diferença.

- [ ] **Step 5: Não commitar ainda**

`npm run typecheck` vai falhar aqui — é esperado. As Tasks 4 e 5 consertam os consumidores. Commit único ao fim da Task 5.

---

### Task 4: R4 — Biblioteca de formulários sem seções

**Files:**
- Modify: `src/lib/forms/core.ts`
- Modify: `src/lib/forms/data-core.ts:48-95`
- Modify: `src/lib/forms/response-core.ts:31-70`
- Modify: `src/lib/forms/actions.ts:60-118`
- Modify: `src/lib/forms/rules.ts:60-63`
- Modify: `src/lib/forms/validation.ts:117`
- Modify: `src/lib/forms/aggregate.ts:43`
- Modify: `src/lib/forms/aggregate.test.ts`, `rules.test.ts`, `validation.test.ts`, `core.dbtest.ts`

**Interfaces:**
- Consumes: `FormDraft.questions` (Task 3).
- Produces: mesmas funções exportadas, agora lendo `draft.questions`.

- [ ] **Step 1: Testes puros primeiro (fixtures)**

`src/lib/forms/aggregate.test.ts`: o objeto `form` perde o nível `sections`. Trocar

```ts
  sections: [
    {
      id: "s1",
      title: "Seção",
      order: 0,
      questions: [
```
por `questions: [` e remover o fechamento `},\n  ],` correspondente (fica só `],`). No teste que reconstrói o formulário (linhas ~105-108), trocar
```ts
    sections: [
      {
        ...form.sections[0]!,
        questions: [{ ...form.sections[0]!.questions[0]!, kind: "CAIXAS_SELECAO" }],
      },
    ],
```
por
```ts
    questions: [{ ...form.questions[0]!, kind: "CAIXAS_SELECAO" }],
```

`src/lib/forms/rules.test.ts`: em `draftWith`, trocar o bloco `sections: [ { id: "s1", title: "S", order: 0, questions: questions.map(...) } ]` por `questions: questions.map(...)` (mesmo map, sem o invólucro). Trocar `draft.sections[0]!.questions[0]!.label` por `draft.questions[0]!.label`.

`src/lib/forms/validation.test.ts:25`: trocar `sections: [{ id: "s1", title: "Seção", order: 0, questions }],` por `questions,`.

- [ ] **Step 2: Rodar e ver falhar por tipo/forma**

Run: `npx tsx --test src/lib/forms/aggregate.test.ts src/lib/forms/rules.test.ts src/lib/forms/validation.test.ts`
Expected: falhas (`form.sections` undefined).

- [ ] **Step 3: Regras puras**

`rules.ts`, em `removalImpact`: trocar `const questions = draft.sections.flatMap((s) => s.questions);` por `const questions = draft.questions;`.

`validation.ts`, em `validateSubmission`: idem — `const questions = form.questions;`.

`aggregate.ts`, em `aggregate`: idem — `const questions = form.questions;`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/forms/aggregate.test.ts src/lib/forms/rules.test.ts src/lib/forms/validation.test.ts`
Expected: todos passando.

- [ ] **Step 5: `data-core.ts` e `response-core.ts` (leitura)**

Nos dois arquivos, a consulta troca

```ts
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
```
por
```ts
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
```

E o mapeamento `sections: form.sections.map((s) => ({ id: s.id, title: s.title, description: ..., order: s.order, questions: s.questions.map((q) => ({...})) }))` vira

```ts
    questions: form.questions.map((q) => ({
      id: q.id,
      kind: q.kind as FormQuestionKind,
      label: q.label,
      helpText: q.helpText ?? undefined,
      required: q.required,
      order: q.order,
      options: q.options.map((o) => ({ id: o.id, label: o.label, order: o.order })),
      scaleMin: q.scaleMin ?? undefined,
      scaleMax: q.scaleMax ?? undefined,
      scaleMinLabel: q.scaleMinLabel ?? undefined,
      scaleMaxLabel: q.scaleMaxLabel ?? undefined,
    })),
```

- [ ] **Step 6: `core.ts` (gravação)**

`currentStructure` vira:

```ts
async function currentStructure(formId: string) {
  const questions = await prisma.formQuestion.findMany({
    where: { formId },
    select: { id: true, label: true, options: { select: { id: true, label: true } } },
  });
  return {
    questions: questions.map((q) => ({ id: q.id, label: q.label })),
    options: questions.flatMap((q) =>
      q.options.map((o) => ({ id: o.id, questionId: q.id, label: o.label })),
    ),
  };
}
```

Em `costOfRemoving`: `const questions = draft.questions;` e o `where` da contagem de opção vira `where: { optionIds: { has: o.id }, question: { formId } }`.

Em `saveFormFor`, apagar `draftSectionIds`; `draftQuestions` vira:

```ts
  const draftQuestions = draft.questions.map((q, i) => ({ ...q, position: i }));
```

Na transação: apagar o laço `for (const [order, section] of draft.sections.entries()) { ... upsert formSection ... }` e o comentário sobre a ordem "seções por último" — substituir o comentário por:

```ts
    // Primeiro tudo que fica é criado ou atualizado NO LUGAR — é o que
    // preserva as respostas das perguntas que sobreviveram. Só depois vem a
    // remoção.
```

No `data` da pergunta, trocar `sectionId: question.sectionId,` por `formId: input.formId,`. Apagar o bloco `goneSections` no fim da transação.

Em `deleteFormFor`, ajustar o comentário: "o cascade do schema arrasta perguntas, opções, atribuições e respostas".

- [ ] **Step 7: `actions.ts`**

`createForm`: trocar o bloco `sections: { create: { title: "Seção 1", order: 0, questions: { create: {...} } } }` por

```ts
      questions: {
        create: {
          kind: "MULTIPLA_ESCOLHA",
          label: "Pergunta sem título",
          order: 0,
          options: { create: [{ label: "Opção 1", order: 0 }] },
        },
      },
```

`draftSchema`: o campo `sections: z.array(z.object({ id, title, description, questions: z.array(...) })).min(1, ...)` vira

```ts
    questions: z
      .array(
        z.object({
          id: z.string().min(1),
          kind: z.enum([
            "TEXTO_CURTO",
            "PARAGRAFO",
            "MULTIPLA_ESCOLHA",
            "CAIXAS_SELECAO",
            "LISTA_SUSPENSA",
            "ESCALA_LINEAR",
          ]),
          label: z.string().trim().min(1, "Toda pergunta precisa de um enunciado."),
          helpText: z.string().trim().optional(),
          required: z.boolean(),
          options: z.array(z.object({ id: z.string().min(1), label: z.string().trim().min(1) })),
          scaleMin: z.number().int().optional(),
          scaleMax: z.number().int().optional(),
          scaleMinLabel: z.string().trim().optional(),
          scaleMaxLabel: z.string().trim().optional(),
        }),
      )
      .min(1, "O formulário precisa de ao menos uma pergunta."),
```

Ajustar o comentário em `saveForm`: "o schema passou a exigi-lo em pergunta e opção".

- [ ] **Step 8: `core.dbtest.ts`**

Trocar todas as ocorrências:
- `sections: [ { id: ..., title: ..., order: 0, questions: [...] } ]` na fixture (linha ~65) → `questions: [...]` (só as perguntas).
- `toFill.sections[0]!.questions` → `toFill.questions` (e as variantes `toFill!`, `renamed`, `first!`, `second`).
- `where: { question: { section: { formId } } }` → `where: { question: { formId } }`.
- `where: { section: { formId } }` → `where: { formId }`.

- [ ] **Step 9: Verificar**

Run: `npm run typecheck` — só `form-builder.tsx` e `form-response-modal.tsx` devem falhar (Task 5).
Run: `npm test` — passando.
Run (com Postgres local): `npm run test:db` — passando.

---

### Task 5: R4 — Construtor e resposta sem seções

**Files:**
- Modify: `src/components/forms/form-builder.tsx`
- Modify: `src/components/forms/form-response-modal.tsx`

- [ ] **Step 1: Construtor**

Em `form-builder.tsx`:
- Import de tipos: `import type { FormDraft, FormQuestionDraft } from "@/types/form";`.
- Import de ícones: sai `Trash2` (não há mais "Excluir seção").
- Apagar `patchSection`, `addSection`, `removeSection`.
- As funções de pergunta perdem o parâmetro `sectionId` e operam em `prev.questions`:

```ts
  function addQuestion() {
    setDraft((prev) => ({
      ...prev,
      questions: [...prev.questions, newQuestion(prev.questions.length)],
    }));
  }

  function patchQuestion(questionId: string, patch: Partial<FormQuestionDraft>) {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
    }));
  }

  function removeQuestion(questionId: string) {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions
        .filter((q) => q.id !== questionId)
        .map((q, i) => ({ ...q, order: i })),
    }));
  }

  function duplicateQuestion(questionId: string) {
    setDraft((prev) => {
      const at = prev.questions.findIndex((q) => q.id === questionId);
      if (at < 0) return prev;
      const original = prev.questions[at]!;
      const copy: FormQuestionDraft = {
        ...original,
        id: crypto.randomUUID(),
        options: original.options.map((o) => ({ ...o, id: crypto.randomUUID() })),
      };
      const questions = [...prev.questions];
      questions.splice(at + 1, 0, copy);
      return { ...prev, questions: questions.map((q, i) => ({ ...q, order: i })) };
    });
  }

  function moveQuestion(questionId: string, delta: -1 | 1) {
    setDraft((prev) => {
      const at = prev.questions.findIndex((q) => q.id === questionId);
      const to = at + delta;
      if (at < 0 || to < 0 || to >= prev.questions.length) return prev;
      const questions = [...prev.questions];
      [questions[at], questions[to]] = [questions[to]!, questions[at]!];
      return { ...prev, questions: questions.map((q, i) => ({ ...q, order: i })) };
    });
  }
```

- Apagar `let questionNumber = 0;`.
- Substituir o JSX de `<div className="mt-4 space-y-4">{draft.sections.map(...)}</div>` **e** o botão "Adicionar seção" por:

```tsx
      <div className="mt-4 space-y-3">
        {draft.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            question={question}
            index={index + 1}
            disabled={locked}
            onChange={(patch) => patchQuestion(question.id, patch)}
            onDuplicate={() => duplicateQuestion(question.id)}
            onDelete={() => removeQuestion(question.id)}
            onMoveUp={() => moveQuestion(question.id, -1)}
            onMoveDown={() => moveQuestion(question.id, 1)}
          />
        ))}
      </div>

      <Button variant="secondary" className="mt-4" onClick={addQuestion} disabled={locked}>
        <Plus className="h-4 w-4" />
        Adicionar pergunta
      </Button>
```

- [ ] **Step 2: Modal de resposta em página única**

Em `form-response-modal.tsx`:
- Imports de ícones: `import { EyeOff, Loader2, X } from "lucide-react";` (saem `ChevronLeft`, `ChevronRight`).
- Apagar `const [page, setPage] = useState(0);`, `lastPage`, `currentSection`, e as funções `goBack`/`goNext` (localizar por nome; são as que fazem `setPage`).
- `const questions = form.questions;` (sem `useMemo`; remover `useMemo` do import de react se ficar sem uso).
- `currentComplete` vira:

```ts
  const allRequiredAnswered = questions.every(
    (q) => !q.required || isQuestionAnswered(q, answers[q.id]),
  );
```
- Em `resetAll`, apagar `setPage(0);`.
- Atualizar o comentário do componente: "Preenchimento de um formulário do DHO, numa página só."
- No bloco de progresso, trocar o `<span className="font-medium">Seção {page + 1} de ...</span>` por `<span className="font-medium">Perguntas</span>`.
- No corpo: apagar `{currentSection?.description && ...}`; `currentSection?.questions.map` → `questions.map`; o aviso `Esta seção não tem perguntas.` vira `questions.length === 0 && (<p className="text-sm text-muted">Este formulário não tem perguntas.</p>)`.
- Rodapé vira:

```tsx
        <footer className="flex items-center justify-end gap-3 border-t border-border p-5">
          <Button size="lg" onClick={handleSubmit} disabled={submitting || !allRequiredAnswered}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Enviando" : "Enviar respostas"}
          </Button>
        </footer>
```

- [ ] **Step 3: Verificar visualmente**

Run: `npm run dev`, entrar como ADMIN em `/setores/rh`, criar um formulário, adicionar/duplicar/mover perguntas, salvar, publicar para si, responder em `/minhas-avaliacoes`. Abrir um formulário **antigo** (criado com várias seções) e confirmar que as perguntas aparecem na ordem seção→pergunta original.

- [ ] **Step 4: Verificar e commitar (Tasks 3–5)**

Run: `npm run typecheck && npm run lint && npm test && npm run test:db`
Run: `grep -rn "FormSection\|sections\b" src prisma/schema.prisma | grep -iv evaluation` → nenhuma linha.

```bash
git add prisma/schema.prisma prisma/migrations/20260918100000_forms_drop_sections src/types/form.ts src/lib/forms src/components/forms
git commit -m "Construtor de Formulários: sai o bloco Seção — o formulário é uma lista única de perguntas e a resposta, uma página só

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: R1 — Aceitar, classificar e servir `.pptx`

**Files:**
- Modify: `prisma/schema.prisma:368-373`
- Create: `prisma/migrations/20260918110000_filekind_pptx/migration.sql`
- Modify: `src/lib/storage/files.ts:35-46,72`
- Modify: `src/app/uploads/[...path]/route.ts:44-62`
- Modify: `src/lib/sector-actions.ts:26-31`
- Modify: `src/types/sector.ts:56`
- Modify: `src/components/sector/document-grid.tsx:8-13`
- Modify: `src/components/sector/file-upload-modal.tsx:18-19`
- Modify: `src/lib/storage/files.test.ts`

**Interfaces:**
- Produces: `FileKind` (Prisma e TS) com `PPTX`; `docKind(mime, name)` reconhece apresentação.

- [ ] **Step 1: Teste da regra de storage**

Abrir `src/lib/storage/files.test.ts`, ver como os testes existentes exercitam `storeFile`/validação (há testes de extensão vs MIME). Adicionar, no mesmo estilo do arquivo, um caso que aceita `.pptx` com MIME `application/vnd.openxmlformats-officedocument.presentationml.presentation` na regra `document`, e um que aceita `.pptx` **sem** MIME (Explorador do Windows manda vazio para alguns tipos). Se o arquivo expõe uma função pura de validação (ex.: `validateFile`/`checkRule`), usar ela; se só há `storeFile`, seguir o padrão de arquivo temporário que os testes já usam.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/storage/files.test.ts`
Expected: os dois novos casos falham com "Formato inválido" (ou equivalente).

- [ ] **Step 3: Regras de storage**

Em `src/lib/storage/files.ts`, na regra `document`:
- `mimes` ganha `"application/vnd.openxmlformats-officedocument.presentationml.presentation"` e `"application/vnd.ms-powerpoint"`.
- Adicionar `extensions: new Set([".pptx", ".ppt"]),` (mesmo mecanismo que `.mkv` usa: MIME pode vir vazio).
- `RULE_EXTENSIONS.document` ganha `".ppt", ".pptx"`.
- Atualizar o comentário do cabeçalho: "vídeos, PDFs, planilhas, documentos, apresentações".

- [ ] **Step 4: Servir com o MIME certo**

Em `src/app/uploads/[...path]/route.ts`, no mapa `CONTENT_TYPE`, adicionar:

```ts
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
```

- [ ] **Step 5: Enum e migration**

`prisma/schema.prisma`, `enum FileKind`: adicionar `PPTX` após `XLSX`.

Criar `prisma/migrations/20260918110000_filekind_pptx/migration.sql`:

```sql
-- Material de Apoio da Vitrine aceita apresentações.
ALTER TYPE "FileKind" ADD VALUE 'PPTX';
```

Run: `npx prisma migrate dev`

- [ ] **Step 6: Classificação e tipos**

`src/lib/sector-actions.ts`, `docKind` vira:

```ts
/** Mapeia MIME (ou, sem ele, a extensão) de documento para o enum FileKind. */
function docKind(mime: string, name: string): "PDF" | "DOCX" | "XLSX" | "PPTX" | "PNG" {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if (mime === "application/pdf" || ext === ".pdf") return "PDF";
  if (mime.includes("presentationml") || mime === "application/vnd.ms-powerpoint" || ext === ".pptx" || ext === ".ppt") return "PPTX";
  if (mime.includes("wordprocessing") || mime === "application/msword" || ext === ".docx" || ext === ".doc") return "DOCX";
  if (mime.includes("spreadsheet") || mime === "application/vnd.ms-excel" || ext === ".xlsx" || ext === ".xls") return "XLSX";
  return "PNG";
}
```

E em `uploadSectorDocument`: `kind: docKind(file.type, file.name),`.

`src/types/sector.ts`: `export type FileKind = "PDF" | "DOCX" | "XLSX" | "PPTX" | "PNG";`

`src/components/sector/document-grid.tsx`, `KIND_STYLE` ganha `PPTX: "bg-warning/15 text-warning",`.

`src/components/sector/file-upload-modal.tsx`: o comentário vira `(PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX/PNG)` e `DOCUMENT_ACCEPT` ganha `,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,.ppt,.pptx`.

- [ ] **Step 7: Verificar e commitar**

Run: `npx tsx --test src/lib/storage/files.test.ts` → passando.
Run: `npm run typecheck && npm run lint && npm test`

```bash
git add prisma/schema.prisma prisma/migrations/20260918110000_filekind_pptx src/lib/storage/files.ts src/lib/storage/files.test.ts src/app/uploads src/lib/sector-actions.ts src/types/sector.ts src/components/sector/document-grid.tsx src/components/sector/file-upload-modal.tsx
git commit -m "Documentos: aceita apresentações (.ppt/.pptx) no envio, no banco e no servidor de arquivos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: R1 — Documentos com Visualizar e Baixar funcionais

**Files:**
- Modify: `src/types/sector.ts:58-64`
- Modify: `src/lib/sector-data.ts:129-135`
- Modify: `src/components/sector/document-grid.tsx`

**Interfaces:**
- Produces: `DocumentItem.filePath: string`.

Contexto: hoje os botões do card são `<button>` sem `onClick` e o item não carrega o caminho — a aba Documentos nunca abriu nem baixou nada. Material de Apoio usa o mesmo grid, então isso precisa funcionar antes da aba existir.

- [ ] **Step 1: Tipo e loader**

`src/types/sector.ts`, em `DocumentItem`, adicionar:

```ts
  /** Caminho público do arquivo, para visualizar/baixar. */
  filePath: string;
```

`src/lib/sector-data.ts`, no map de `documents`: incluir `filePath: string` no tipo inline do parâmetro e `filePath: d.filePath,` no objeto devolvido.

- [ ] **Step 2: Grid**

Em `src/components/sector/document-grid.tsx`, substituir o `<div className="mt-4 flex gap-2">...</div>` (os dois `<button>` sem ação) por:

```tsx
          <div className="mt-4 flex gap-2">
            {/* Só o PDF abre no navegador. Office (DOCX/XLSX/PPTX) não
                renderiza sem serviço externo, e mandar o arquivo para um
                visualizador de terceiros exporia o acervo — então só baixa. */}
            {doc.kind === "PDF" && (
              <a
                href={doc.filePath}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-surface-2 text-xs text-foreground transition-colors hover:bg-surface-3"
              >
                <Eye className="h-3.5 w-3.5" />
                Visualizar
              </a>
            )}
            <a
              href={doc.filePath}
              download
              aria-label={`Baixar ${doc.name}`}
              className={cn(
                "focus-ring flex h-9 items-center justify-center gap-2 rounded-lg bg-primary/15 text-xs text-primary transition-colors hover:bg-primary/25",
                doc.kind === "PDF" ? "w-9" : "flex-1",
              )}
            >
              <Download className="h-3.5 w-3.5" />
              {doc.kind !== "PDF" && "Baixar"}
            </a>
          </div>
```

- [ ] **Step 3: Verificar**

Run: `npm run dev`; num setor padrão, aba Documentos: PDF abre em nova aba; DOCX baixa. Confirmar no DevTools que a resposta vem de `/uploads/...` com `Content-Type` correto.

- [ ] **Step 4: Commitar**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/types/sector.ts src/lib/sector-data.ts src/components/sector/document-grid.tsx
git commit -m "Documentos: Visualizar abre o PDF em nova aba e Baixar baixa de verdade — os botões não faziam nada

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: R1 — Aba "Material de Apoio" na Vitrine

**Files:**
- Modify: `src/types/sector.ts:3-11`
- Modify: `src/components/sector/sector-page.tsx`
- Modify: `src/lib/sector-data.ts` (descrição da vitrine)

**Interfaces:**
- Consumes: `DocumentGrid` (Task 7), `FileUploadModal` (Task 6).
- Produces: `TabId` com `"material"`.

- [ ] **Step 1: TabId**

`src/types/sector.ts`: adicionar `| "material"` à união `TabId`.

- [ ] **Step 2: Aba**

Em `src/components/sector/sector-page.tsx`:

```ts
const VITRINE_TABS: readonly TabDef[] = [
  { id: "fotos", label: "Fotos da Coleção", uploadLabel: "Enviar foto" },
  { id: "videos", label: "Vídeos da Coleção", uploadLabel: "Enviar vídeo" },
  { id: "workshop", label: "Workshop", uploadLabel: "Enviar workshop" },
  // Documentos e apresentações da vitrine. Reusa o modelo Document: a vitrine
  // não tem aba Documentos, então não há ambiguidade — e o progresso já
  // ignora tudo que é VITRINE (ver lib/progress-scope).
  { id: "material", label: "Material de Apoio", uploadLabel: "Enviar material" },
];
```

Em `openUpload`: adicionar `if (tabId === "material") return setDocumentModalOpen(true);`.

No `TabPanel`, trocar `{activeId === "documentos" && (` por `{(activeId === "documentos" || activeId === "material") && (` e o placeholder da busca por `placeholder={activeId === "material" ? "Buscar material" : "Buscar documento"}`.

- [ ] **Step 3: Título do modal de envio**

`FileUploadModal` mostra "Enviar documento" fixo. Adicionar prop opcional `title?: string` (default `"Enviar documento"`) e usá-la no `<h2>`. Em `sector-page.tsx`: `<FileUploadModal slug={sector.slug} open={documentModalOpen} title={activeId === "material" ? "Enviar material de apoio" : "Enviar documento"} onClose={...} />`.

- [ ] **Step 4: Descrição da vitrine**

`src/lib/sector-data.ts`: `"Galeria, vídeos, workshops e material de apoio da vitrine."`.

- [ ] **Step 5: Verificar**

Run: `npm run dev`; abrir uma vitrine (OKEY/Lov Club) como ADMIN: aba aparece por último, envia um `.pptx` e um `.pdf`, ambos listam; PDF visualiza, PPTX baixa. Em `/progresso` e na Início, nada muda (vitrine fora do cálculo). Como COLABORADOR: vê a aba, sem botão de envio.

- [ ] **Step 6: Commitar**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/types/sector.ts src/components/sector/sector-page.tsx src/components/sector/file-upload-modal.tsx src/lib/sector-data.ts
git commit -m "Vitrine: aba Material de Apoio — documentos e apresentações (PDF, DOCX, PPTX) da vitrine

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: R5 — `VideoShare` no schema e no loader do setor

**Files:**
- Modify: `prisma/schema.prisma:321-351` (model Video) e `143-189` (model Subsector)
- Create: `prisma/migrations/20260918120000_video_share/migration.sql`
- Create: `src/lib/video-share.ts`, `src/lib/video-share.test.ts`
- Modify: `src/types/sector.ts` (VideoItem)
- Modify: `src/lib/sector-data.ts`

**Interfaces:**
- Produces:
  - Prisma `VideoShare { videoId, subsectorId, createdAt }`, `Video.shares`, `Subsector.sharedVideos`.
  - `VideoItem.sharedFrom?: string` (rótulo do subsetor dono; presente só no destino) e `VideoItem.sharedWith?: readonly string[]` (ids dos subsetores destino; presente só no dono).
  - `mergeSharedVideos<T extends { id: string }>(own: readonly T[], shared: readonly T[]): T[]` — próprios primeiro, compartilhados depois, sem repetir id.

- [ ] **Step 1: Teste da regra pura**

```ts
// src/lib/video-share.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { mergeSharedVideos } from "./video-share";

/**
 * Um vídeo compartilhado é a MESMA linha de Video, lida por outro subsetor.
 * Se o dono também for destino (share para si mesmo, por engano ou por dado
 * antigo), o card não pode aparecer duas vezes.
 */

test("próprios vêm antes dos compartilhados", () => {
  const merged = mergeSharedVideos([{ id: "a" }], [{ id: "b" }]);
  assert.deepEqual(merged.map((v) => v.id), ["a", "b"]);
});

test("não repete um id que já está entre os próprios", () => {
  const merged = mergeSharedVideos([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]);
  assert.deepEqual(merged.map((v) => v.id), ["a", "b", "c"]);
});

test("listas vazias devolvem vazio", () => {
  assert.deepEqual(mergeSharedVideos([], []), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/video-share.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Regra pura**

```ts
// src/lib/video-share.ts
/**
 * Compartilhamento de vídeo entre subsetores.
 *
 * Um vídeo compartilhado não é cópia: é a mesma linha de `Video` (e o mesmo
 * arquivo em disco) lida a partir de outro subsetor, via `VideoShare`. O que
 * este módulo decide, sem Prisma nem React, é como a lista do subsetor de
 * destino se compõe.
 */

/** Próprios primeiro, compartilhados depois; um id aparece uma vez só. */
export function mergeSharedVideos<T extends { id: string }>(
  own: readonly T[],
  shared: readonly T[],
): T[] {
  const seen = new Set(own.map((v) => v.id));
  const extra = shared.filter((v) => !seen.has(v.id) && (seen.add(v.id), true));
  return [...own, ...extra];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/video-share.test.ts` → 3 passing.

- [ ] **Step 5: Schema e migration**

`prisma/schema.prisma`, no `model Video`, após `comprehensions VideoComprehension[]`:

```prisma
  // Subsetores que também enxergam este vídeo. Mesma linha, mesmo arquivo:
  // compartilhar não duplica nada em disco. Só ADMIN cria e remove.
  shares VideoShare[]
```

No `model Subsector`, após `posts     ContentPost[]`:

```prisma
  sharedVideos VideoShare[]
```

Novo modelo, logo após `model Video`:

```prisma
/**
 * Vídeo de UM subsetor visível em OUTRO. A linha é só a permissão de leitura:
 * quem edita e exclui continua sendo o subsetor dono (Video.subsectorId), e
 * o cascade dos dois lados garante que não sobra share de vídeo ou de
 * subsetor apagado. Não entra no progresso do destino (ver lib/progress-*).
 */
model VideoShare {
  videoId String
  video   Video  @relation(fields: [videoId], references: [id], onDelete: Cascade)

  subsectorId String
  subsector   Subsector @relation(fields: [subsectorId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@id([videoId, subsectorId])
  @@index([subsectorId])
}
```

`prisma/migrations/20260918120000_video_share/migration.sql`:

```sql
-- Compartilhamento de vídeo entre subsetores: mesma linha de Video, mesmo
-- arquivo em disco, uma linha de permissão por destino.
CREATE TABLE "VideoShare" (
    "videoId" TEXT NOT NULL,
    "subsectorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoShare_pkey" PRIMARY KEY ("videoId","subsectorId")
);

CREATE INDEX "VideoShare_subsectorId_idx" ON "VideoShare"("subsectorId");

ALTER TABLE "VideoShare" ADD CONSTRAINT "VideoShare_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoShare" ADD CONSTRAINT "VideoShare_subsectorId_fkey" FOREIGN KEY ("subsectorId") REFERENCES "Subsector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Run: `npx prisma migrate dev`

- [ ] **Step 6: Tipo do item**

`src/types/sector.ts`, em `VideoItem`, após `transcriptPath?: string;`:

```ts
  /**
   * Rótulo do subsetor dono, presente só quando o vídeo chegou aqui por
   * compartilhamento. Com ele, o card não oferece editar nem excluir.
   */
  sharedFrom?: string;
  /** Ids dos subsetores que recebem este vídeo. Presente só no subsetor dono. */
  sharedWith?: readonly string[];
```

- [ ] **Step 7: Loader**

Em `src/lib/sector-data.ts`, `getSectorContent`:

1. Import: `import { mergeSharedVideos } from "@/lib/video-share";`.
2. No `include` do `findUnique`, trocar `videos: { orderBy: { order: "asc" } }` por `videos: { orderBy: { order: "asc" }, include: { shares: { select: { subsectorId: true } } } }`.
3. Logo após `if (!sub) return null;`, carregar os compartilhados:

```ts
  // Vídeos que outros subsetores compartilharam com este. Só INSTRUCAO faz
  // sentido aqui (a tela de edição só oferece o compartilhamento nessa aba),
  // mas o filtro é por segurança: uma vitrine não deve receber Workshop.
  const sharedRows = await prisma.videoShare.findMany({
    where: { subsectorId: sub.id, video: { kind: "INSTRUCAO" } },
    select: { video: { include: { subsector: { select: { label: true } } } } },
  });
```

4. A consulta de `progress` e `comprehensions` passa a cobrir os compartilhados: montar `const videoIds = [...sub.videos.map((v) => v.id), ...sharedRows.map((r) => r.video.id)];` e trocar `OR: [{ video: { subsectorId: sub.id } }, { document: { subsectorId: sub.id } }]` por `OR: [{ videoId: { in: videoIds } }, { document: { subsectorId: sub.id } }]`, e `where: { userId, video: { subsectorId: sub.id } }` por `where: { userId, videoId: { in: videoIds } }`.

5. Extrair a construção de `VideoItem` numa função local para reusar:

```ts
  type VideoRow = {
    id: string;
    title: string;
    isNew: boolean;
    tags: string[];
    kind: string;
    filePath: string | null;
    thumbnailPath: string | null;
    transcriptPath: string | null;
    transcriptText: string | null;
  };
  const toItem = (v: VideoRow): VideoItem => ({
    id: v.id,
    title: v.title,
    watched: doneVideo.has(v.id),
    ended: endedVideo.has(v.id),
    comprehension: comprehensionOf.get(v.id),
    isNew: v.isNew,
    tags: v.tags,
    filePath: v.filePath ?? undefined,
    thumbnailPath: v.thumbnailPath ?? undefined,
    transcriptPath: v.transcriptPath ?? undefined,
    transcriptText: v.transcriptText ?? undefined,
  });
```

O laço existente vira:

```ts
  const videos: VideoItem[] = [];
  const workshops: VideoItem[] = [];
  for (const v of sub.videos as Array<VideoRow & { shares: { subsectorId: string }[] }>) {
    const item = { ...toItem(v), sharedWith: v.shares.map((s) => s.subsectorId) };
    if (v.kind === "WORKSHOP") workshops.push(item);
    else videos.push(item);
  }
  const shared: VideoItem[] = sharedRows.map((r) => ({
    ...toItem(r.video as VideoRow),
    sharedFrom: (r.video as { subsector: { label: string } }).subsector.label,
  }));
  const allVideos = mergeSharedVideos(videos, shared);
```

E a linha da Task 1 vira `const orderedVideos = instrucoes ? sortInstrucoes(allVideos) : allVideos;`.

6. **Conclusão da área** (`total`/`done`): manter `sub.videos.length` — compartilhado não conta. Adicionar comentário: `// Compartilhados não entram: o progresso é do subsetor dono.`

- [ ] **Step 8: Verificar e commitar**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add prisma/schema.prisma prisma/migrations/20260918120000_video_share src/lib/video-share.ts src/lib/video-share.test.ts src/types/sector.ts src/lib/sector-data.ts
git commit -m "Vídeos: VideoShare — um vídeo de um subsetor pode ser lido por outros, sem copiar arquivo; o destino lista mas não edita nem conta no progresso

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: R5 — Server Actions: alvos e gravação dos shares

**Files:**
- Modify: `src/lib/sector-actions.ts:255-350`

**Interfaces:**
- Produces:
  - `listVideoShareTargets(slug: string): Promise<{ id: string; label: string; sector: string }[]>` — subsetores PADRAO **exceto** o próprio `slug`, em ordem de setor/subsetor. Vazio para quem não é ADMIN.
  - `updateSectorVideo` aceita `shareWith` (FormData `getAll("shareWith")`) e, **só se o ator for ADMIN**, sincroniza `VideoShare`. Para GESTOR o campo é ignorado (não é erro: a tela nem mostra).

- [ ] **Step 1: Listar alvos**

Adicionar em `sector-actions.ts`, na seção "Edição e exclusão de vídeo":

```ts
/**
 * Subsetores que podem receber um vídeo compartilhado: todos os PADRAO, menos
 * o dono. Só ADMIN compartilha (decisão de 18/09/2026); para os demais a
 * lista é vazia e a tela não mostra o campo.
 */
export async function listVideoShareTargets(
  slug: string,
): Promise<{ id: string; label: string; sector: string }[]> {
  const user = await getCurrentUser();
  if (!user || (user.role as Role) !== "ADMIN") return [];

  const rows = await prisma.subsector.findMany({
    where: { kind: "PADRAO", slug: { not: slug } },
    select: { id: true, label: true, sector: { select: { label: true, order: true } }, order: true },
    orderBy: [{ sector: { order: "asc" } }, { order: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, label: r.label, sector: r.sector.label }));
}
```

- [ ] **Step 2: Gravar shares na edição**

Em `videoUpdateSchema`, adicionar:

```ts
  // Destinos do compartilhamento. Só ADMIN grava; para os demais é ignorado.
  shareWith: z.array(z.string().min(1)).max(100).default([]),
```

Em `updateSectorVideo`, no `safeParse`, incluir `shareWith: formData.getAll("shareWith").map(String),`. Após `const tags = dedupeTags(parsed.data.tags);`:

```ts
  const isAdmin = (user.role as Role) === "ADMIN";
```

Trocar o `prisma.video.update({...})` dentro do `try` por:

```ts
    await prisma.$transaction(async (tx) => {
      await tx.video.update({
        where: { id },
        data: { title, tags, transcriptPath, transcriptText },
      });
      if (!isAdmin) return;
      // Sincroniza os destinos: o que saiu da lista perde o acesso, o que
      // entrou ganha. O próprio subsetor dono nunca é destino.
      const wanted = new Set(parsed.data.shareWith.filter((sid) => sid !== subsectorId));
      await tx.videoShare.deleteMany({
        where: { videoId: id, subsectorId: { notIn: [...wanted] } },
      });
      if (wanted.size > 0) {
        await tx.videoShare.createMany({
          data: [...wanted].map((sid) => ({ videoId: id, subsectorId: sid })),
          skipDuplicates: true,
        });
      }
    });
```

Após o `revalidatePath(`/setores/${slug}`)`, revalidar os destinos também — o vídeo aparece/desaparece lá:

```ts
  if (isAdmin) {
    const targets = await prisma.subsector.findMany({
      where: { id: { in: parsed.data.shareWith } },
      select: { slug: true },
    });
    for (const t of targets) revalidatePath(`/setores/${t.slug}`);
  }
```

Atualizar o comentário do cabeçalho de `updateSectorVideo`: "Tela de edição do vídeo: título, tags, transcrição e — para ADMIN — com quais subsetores o vídeo é compartilhado."

- [ ] **Step 3: Exclusão**

`deleteSectorVideo` não muda: `prisma.video.delete` cascateia `VideoShare`, e a busca `where: { id, subsectorId }` já garante que só o dono exclui (o destino não tem os controles, e mesmo forjando a chamada, o `findFirst` não acha). Adicionar ao comentário da função: "Os compartilhamentos caem em cascata; o arquivo só sai aqui, pelo dono."

- [ ] **Step 4: Verificar e commitar**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/lib/sector-actions.ts
git commit -m "Vídeos: ADMIN escolhe na edição com quais subsetores o vídeo é compartilhado; os destinos são revalidados

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: R5 — Tela de edição e card

**Files:**
- Modify: `src/components/sector/media-edit-modal.tsx`
- Modify: `src/components/sector/editable-media-actions.tsx`
- Modify: `src/components/sector/video-card.tsx`

**Interfaces:**
- Consumes: `listVideoShareTargets`, `VideoItem.sharedFrom`, `VideoItem.sharedWith`.
- Produces: `MediaEditValue.shareWith?: readonly string[]`; `MediaEditModalProps.sharing?: { slug: string; current: readonly string[] }`; `EditableMediaActionsProps.sharing?` (mesmo tipo, repassado).

- [ ] **Step 1: Modal — campo "Compartilhar com"**

Em `media-edit-modal.tsx`:

Imports: adicionar `Share2` ao import de `lucide-react`; `import { useRole } from "@/providers/role-provider";`; `import { listVideoShareTargets } from "@/lib/sector-actions";`.

`MediaEditValue` ganha:

```ts
  /** Só existe quando o modal foi aberto com `sharing`. */
  shareWith?: readonly string[];
```

`MediaEditModalProps` ganha:

```ts
  /**
   * Presente só para vídeos de Instruções: habilita "Compartilhar com".
   * `current` são os ids dos subsetores que já recebem o vídeo.
   */
  sharing?: { slug: string; current: readonly string[] };
```

Dentro do componente, após os `useState` existentes:

```ts
  const { role } = useRole();
  const canShare = Boolean(sharing) && role === "ADMIN";
  const [targets, setTargets] = useState<{ id: string; label: string; sector: string }[]>([]);
  const [shareWith, setShareWith] = useState<readonly string[]>(sharing?.current ?? []);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // A lista de subsetores vem do servidor ao abrir, e só para quem pode
  // compartilhar: o modal serve a todo card e não deve puxar isso à toa.
  useEffect(() => {
    if (!open || !canShare || !sharing) return;
    setShareWith(sharing.current);
    let alive = true;
    setLoadingTargets(true);
    void listVideoShareTargets(sharing.slug)
      .then((rows) => alive && setTargets(rows))
      .finally(() => alive && setLoadingTargets(false));
    return () => {
      alive = false;
    };
  }, [open, canShare, sharing]);

  function toggleShare(id: string) {
    setShareWith((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
```

Atenção ao `useEffect` existente que recarrega ao abrir: ele depende de `[open, initial.title, initial.tags]` — não mexer.

Em `handleSave`, o objeto enviado ganha `...(canShare ? { shareWith } : {}),`.

A `description` do modal, quando `sharing` presente e `canShare`: `"Altere o título, os filtros, a transcrição e com quem o vídeo é compartilhado."`.

No JSX, após o bloco `{transcript && (...)}` e antes de `{serverError && ...}`:

```tsx
        {canShare && (
          <div>
            <Label>Compartilhar com outros setores</Label>
            <p className="mb-2 text-[11px] text-muted">
              O mesmo arquivo passa a aparecer nas Instruções em Vídeo dos setores marcados. Só
              este setor edita ou exclui.
            </p>
            {loadingTargets ? (
              <p className="text-xs text-muted">Carregando setores…</p>
            ) : targets.length === 0 ? (
              <p className="text-xs text-muted">Nenhum outro setor disponível.</p>
            ) : (
              <div className="scrollbar-slim max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2">
                {targets.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-surface-3"
                  >
                    <input
                      type="checkbox"
                      checked={shareWith.includes(t.id)}
                      onChange={() => toggleShare(t.id)}
                      disabled={saving}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0 truncate">
                      {t.label}
                      <span className="ml-1 text-xs text-muted">· {t.sector}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {shareWith.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                <Share2 className="h-3 w-3" /> Compartilhado com {shareWith.length} setor(es).
              </p>
            )}
          </div>
        )}
```

- [ ] **Step 2: Repassar pelo wrapper**

Em `editable-media-actions.tsx`: `EditableMediaActionsProps` ganha `sharing?: { slug: string; current: readonly string[] };`, a função recebe `sharing,` e passa `sharing={sharing}` para `<MediaEditModal>`.

- [ ] **Step 3: Card**

Em `video-card.tsx`:

Import: adicionar `Share2` ao import de `lucide-react`.

Em `useVideoAdmin.save`, após o laço de tags: `for (const sid of value.shareWith ?? []) fd.append("shareWith", sid);`.

No objeto devolvido por `useVideoAdmin`, adicionar:

```ts
    // Só Instruções compartilham (o servidor filtra por INSTRUCAO). O card
    // não sabe o kind; `comprehension` é o que identifica a aba. Passado
    // como parâmetro abaixo.
```

Trocar a assinatura para `function useVideoAdmin(slug: string, video: VideoItem, sharing: boolean)` e incluir no retorno:

```ts
    sharing: sharing ? { slug, current: video.sharedWith ?? [] } : undefined,
```

Nas chamadas `useVideoAdmin(slug, video)` (em `VideoCard` e `VideoListRow`), passar `comprehension` como terceiro argumento.

Selo de origem — novo componente ao lado de `TranscriptBadge`:

```tsx
/** Vídeo que chegou por compartilhamento: mostra de onde veio. */
function SharedBadge({ video, className }: { video: VideoItem; className?: string }) {
  if (!video.sharedFrom) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted",
        className,
      )}
      title={`Compartilhado por ${video.sharedFrom}`}
    >
      <Share2 className="h-3 w-3" /> {video.sharedFrom}
    </span>
  );
}
```

Em `VideoCard`: trocar `<EditableMediaActions {...admin} suggestions={suggestions} />` por `{!video.sharedFrom && <EditableMediaActions {...admin} suggestions={suggestions} />}` e, no rodapé do card, após o `<h3>`, adicionar `<SharedBadge video={video} className="shrink-0" />` antes de `<TranscriptBadge .../>`.

Em `VideoListRow`: mesmo condicional em `EditableMediaActions`; adicionar `<SharedBadge video={video} className="mt-1 mr-2" />` junto ao `TranscriptBadge`.

- [ ] **Step 4: Verificar no navegador**

Run: `npm run dev`. Como ADMIN, num setor padrão, editar uma Instrução: marcar dois subsetores, salvar. Abrir um dos destinos: o vídeo aparece com o selo do setor de origem e **sem** lápis/lixeira; reproduz, chega ao fim, pergunta abre e a resposta grava. Voltar ao dono, desmarcar um destino, salvar: some de lá. Excluir o vídeo no dono: some de todos. Como GESTOR: a edição não mostra o campo. `/progresso` do destino não muda com o vídeo compartilhado.

Conferir no disco (`uploads/conteudo/...`) que há **um** arquivo por vídeo.

- [ ] **Step 5: Verificar e commitar**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/components/sector/media-edit-modal.tsx src/components/sector/editable-media-actions.tsx src/components/sector/video-card.tsx
git commit -m "Instruções em Vídeo: na edição, ADMIN compartilha o vídeo com outros subsetores; no destino o card mostra a origem e não oferece editar/excluir

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fora do escopo (dito explicitamente)

- Visualização de DOCX/PPTX dentro do app (exigiria conversão para PDF no servidor — LibreOffice no container — ou serviço externo).
- Contar vídeo compartilhado no progresso do destino.
- Compartilhar Coleção/Workshop (vitrines) ou documentos.
- Discriminador `DocumentKind` para separar "Documentos" de "Material de Apoio" num mesmo subsetor — hoje nenhum subsetor tem as duas abas.
- Arquivos órfãos de seções antigas: não existem (seção não tinha arquivo).

## Self-review

- **Cobertura:** R1 → Tasks 6, 7, 8. R2 → Task 1. R3 → Task 2. R4 → Tasks 3, 4, 5. R5 → Tasks 9, 10, 11. Sem lacuna.
- **Tipos:** `sortInstrucoes` (T1) é usada em T9 com `allVideos`; `VideoItem.sharedFrom/sharedWith` definidos em T9 e lidos em T11; `MediaEditValue.shareWith` (T11) casa com `shareWith` de `videoUpdateSchema` (T10); `FormDraft.questions` (T3) é o que T4 e T5 consomem; `DocumentItem.filePath` (T7) é usado no grid da T8 via `DocumentGrid`.
- **Placeholders:** Task 6 Step 1 depende de ver o estilo de `files.test.ts` — é leitura, não invenção; o comportamento a testar está descrito. O restante tem código.
