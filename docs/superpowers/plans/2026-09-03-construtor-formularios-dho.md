# Construtor de Formulários do DHO — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O DHO cria formulários dinâmicos; os destinatários respondem em "Minhas Avaliações"; o DHO lê os resultados num dashboard.

**Architecture:** Subsistema novo, paralelo aos 5 instrumentos de avaliação existentes (que não são tocados). Seis tabelas novas, lógica pura isolada em `src/lib/forms/` com testes `node:test`, Server Actions guardadas por `forms.manage` e recortadas por setor na consulta.

**Tech Stack:** Next.js 15 App Router · React 18 · Prisma 6 sobre PostgreSQL · Tailwind 3 · Zod · `node:test` + `tsx`

**Spec:** [`docs/superpowers/specs/2026-09-03-construtor-formularios-dho-design.md`](../specs/2026-09-03-construtor-formularios-dho-design.md)

## Global Constraints

- **Português** em todo texto de interface, comentário e mensagem de commit. O código (identificadores) em inglês, como no resto do repositório.
- **Toda guarda é conferida no servidor.** Filtro de leitura vai na cláusula da consulta, nunca só na tela. Lição do quadro de chamados: filtrar no navegador não esconde de quem abre o DevTools.
- **`forms.manage`** em `GESTOR` e `ADMIN`. GESTOR é recortado por `ownerSectorId = seu setor`; ADMIN vê tudo.
- **Piso de anonimato: 5 respostas.** Abaixo disso, formulário anônimo não exibe agregado.
- **Cor de preenchimento dos gráficos: token `accent`.** Nunca `primary` (reprova contraste no tema claro: 2,97:1) e nunca cor por opção.
- **Migration aditiva.** Nenhuma coluna existente muda.
- Rodar ao final de cada tarefa: `npm run typecheck`, `npm run lint`, `npm test`.
- Nenhum comando `prisma migrate dev` — não há banco nesta máquina. A migration é escrita à mão, como a `20260903120000_ticket_assigned_by`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | 3 enums + 6 modelos novos |
| `prisma/migrations/20260904120000_forms/migration.sql` | DDL escrita à mão |
| `src/types/form.ts` | DTOs do construtor, do preenchimento e do dashboard |
| `src/lib/forms/rules.ts` | Regras puras: edição travada, piso de anonimato, pode responder |
| `src/lib/forms/validation.ts` | Validação da submissão contra o schema do formulário |
| `src/lib/forms/aggregate.ts` | Agregação das respostas para o dashboard |
| `src/lib/forms/data.ts` | Consultas (listagem, formulário completo, resultados) |
| `src/lib/forms/actions.ts` | Server Actions do construtor e da publicação |
| `src/lib/forms/response-actions.ts` | Server Action de submissão (separada: guarda diferente) |
| `src/components/hr/forms-panel.tsx` | Bloco "Formulários" dentro de Resultados de Avaliações |
| `src/app/setores/rh/formularios/[id]/page.tsx` | Página do construtor |
| `src/components/forms/form-builder.tsx` | Construtor (casca + estado) |
| `src/components/forms/question-editor.tsx` | Editor de uma pergunta |
| `src/components/forms/publish-modal.tsx` | Destinatários + anonimato |
| `src/components/forms/form-response-modal.tsx` | Preenchimento |
| `src/components/forms/question-input.tsx` | Renderiza o campo por tipo |
| `src/components/forms/form-dashboard.tsx` | Dashboard de resultados |
| `src/components/forms/answer-bars.tsx` | Barras horizontais em `accent` |

Arquivos separados por responsabilidade, não por camada: `rules`, `validation` e `aggregate` são lógica pura e testável sem banco; `data` e `actions` tocam o Prisma. É essa separação que permite testar o núcleo sem infraestrutura.

---

## Task 1: Schema, tipos e permissão

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260904120000_forms/migration.sql`
- Create: `src/types/form.ts`
- Modify: `src/types/index.ts` (adicionar `"forms.manage"` ao union `Permission`)
- Modify: `src/lib/permissions.ts` (GESTOR e ADMIN)
- Test: `src/lib/permissions.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: modelos Prisma `Form`, `FormSection`, `FormQuestion`, `FormOption`, `FormAssignment`, `FormResponse`, `FormAnswer`; enums `FormStatus`, `FormAssignmentStatus`, `FormQuestionKind`; tipos `FormQuestionKind`, `FormDraft`, `FormQuestionDraft`, `FormOptionDraft` em `src/types/form.ts`; permissão `"forms.manage"`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/permissions.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { can } from "./permissions";

test("forms.manage pertence a GESTOR e ADMIN, nunca ao COLABORADOR", () => {
  assert.equal(can("ADMIN", "forms.manage"), true);
  assert.equal(can("GESTOR", "forms.manage"), true);
  assert.equal(can("COLABORADOR", "forms.manage"), false);
});

test("forms.manage é distinta de sector.hr — o gestor cria formulário sem administrar o DHO", () => {
  assert.equal(can("GESTOR", "sector.hr"), false);
  assert.equal(can("GESTOR", "forms.manage"), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/permissions.test.ts`
Expected: FAIL — `"forms.manage"` não existe no tipo `Permission` (erro de tipo em tempo de execução do tsx).

- [ ] **Step 3: Adicionar a permissão ao tipo**

Em `src/types/index.ts`, dentro do union `Permission`, logo após `"tickets.claim"`:

```ts
  | "tickets.claim"
  // Criar, publicar e ler os resultados dos formulários do DHO. GESTOR e ADMIN;
  // o recorte por setor é feito na consulta, não aqui — a matriz é por papel.
  | "forms.manage";
```

- [ ] **Step 4: Adicionar à matriz**

Em `src/lib/permissions.ts`, acrescentar `"forms.manage",` ao array de `GESTOR` (após `"evaluations.fill"`) e ao de `ADMIN` (após `"evaluations.fill"`).

- [ ] **Step 5: Rodar e ver passar**

Run: `npx tsx --test src/lib/permissions.test.ts`
Expected: PASS — 2 testes.

- [ ] **Step 6: Escrever os modelos Prisma**

Ao final de `prisma/schema.prisma`:

```prisma
enum FormStatus {
  RASCUNHO
  PUBLICADO
  ENCERRADO
}

enum FormAssignmentStatus {
  PENDENTE
  CONCLUIDA
}

enum FormQuestionKind {
  TEXTO_CURTO
  PARAGRAFO
  MULTIPLA_ESCOLHA
  CAIXAS_SELECAO
  LISTA_SUSPENSA
  ESCALA_LINEAR
}

/// Formulário criado pelo DHO. Subsistema separado dos 5 instrumentos de
/// avaliação: aqueles têm uma escala numérica só e não guardam texto.
model Form {
  id          String     @id @default(cuid())
  title       String
  description String?
  status      FormStatus @default(RASCUNHO)

  /// Respostas não guardam autor. Definido na criação; imutável após publicar.
  anonymous Boolean @default(false)

  /// Setor dono, e a chave do recorte de leitura. GESTOR grava o próprio setor;
  /// ADMIN grava null — formulário da empresa, que nenhum gestor lê.
  ownerSectorId String?
  ownerSector   Sector? @relation(fields: [ownerSectorId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy   User?   @relation("FormAuthor", fields: [createdById], references: [id], onDelete: SetNull)

  publishedAt DateTime?
  closedAt    DateTime?
  /// Prazo informativo. Não bloqueia resposta — quem bloqueia é o status.
  dueAt       DateTime?

  sections    FormSection[]
  assignments FormAssignment[]
  responses   FormResponse[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([ownerSectorId])
}

model FormSection {
  id          String  @id @default(cuid())
  formId      String
  form        Form    @relation(fields: [formId], references: [id], onDelete: Cascade)
  title       String
  description String?
  order       Int     @default(0)

  questions FormQuestion[]

  @@index([formId, order])
}

model FormQuestion {
  id        String           @id @default(cuid())
  sectionId String
  section   FormSection      @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  kind      FormQuestionKind
  label     String
  helpText  String?
  required  Boolean          @default(false)
  order     Int              @default(0)

  /// Só para ESCALA_LINEAR.
  scaleMin      Int?
  scaleMax      Int?
  scaleMinLabel String?
  scaleMaxLabel String?

  options FormOption[]
  answers FormAnswer[]

  @@index([sectionId, order])
}

model FormOption {
  id         String       @id @default(cuid())
  questionId String
  question   FormQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  label      String
  order      Int          @default(0)

  @@index([questionId, order])
}

/// Pendência de resposta. É este registro — e não a resposta — que responde
/// "quem já respondeu", e é o que permite cobrar quem falta num formulário
/// anônimo sem ligar ninguém à resposta.
model FormAssignment {
  id     String @id @default(cuid())
  formId String
  form   Form   @relation(fields: [formId], references: [id], onDelete: Cascade)
  userId String
  user   User   @relation("FormAssignee", fields: [userId], references: [id], onDelete: Cascade)

  status      FormAssignmentStatus @default(PENDENTE)
  respondedAt DateTime?

  createdAt DateTime @default(now())

  @@unique([formId, userId])
  @@index([userId, status])
}

model FormResponse {
  id     String @id @default(cuid())
  formId String
  form   Form   @relation(fields: [formId], references: [id], onDelete: Cascade)

  /// null quando o formulário é anônimo.
  respondentId String?
  respondent   User?   @relation("FormRespondent", fields: [respondentId], references: [id], onDelete: SetNull)

  submittedAt DateTime @default(now())

  answers FormAnswer[]

  @@index([formId])
}

model FormAnswer {
  id         String       @id @default(cuid())
  responseId String
  response   FormResponse @relation(fields: [responseId], references: [id], onDelete: Cascade)
  questionId String
  question   FormQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)

  /// TEXTO_CURTO, PARAGRAFO
  text String?
  /// ESCALA_LINEAR
  number Int?
  /// MULTIPLA_ESCOLHA e LISTA_SUSPENSA guardam 1; CAIXAS_SELECAO guarda N.
  /// Array e não FK: mantém "uma linha por pergunta" cravado no banco. O preço
  /// é não ter integridade referencial, coberto por travar a estrutura do
  /// formulário depois da primeira resposta (ver lib/forms/rules.ts).
  optionIds String[] @default([])

  @@unique([responseId, questionId])
  @@index([questionId])
}
```

- [ ] **Step 7: Adicionar as relações inversas**

Em `model User`, junto das outras relações de atividade:

```prisma
  authoredForms   Form[]           @relation("FormAuthor")
  formAssignments FormAssignment[] @relation("FormAssignee")
  formResponses   FormResponse[]   @relation("FormRespondent")
```

Em `model Sector`, junto de `users`:

```prisma
  forms Form[]
```

- [ ] **Step 8: Escrever a migration à mão**

Criar `prisma/migrations/20260904120000_forms/migration.sql`:

```sql
-- Construtor de formulários do DHO.
--
-- Puramente aditiva: 3 enums e 6 tabelas novas. Nenhuma coluna existente muda,
-- então os 5 instrumentos de avaliação e suas telas de resultado não são
-- afetados. Não há backfill.

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ENCERRADO');
CREATE TYPE "FormAssignmentStatus" AS ENUM ('PENDENTE', 'CONCLUIDA');
CREATE TYPE "FormQuestionKind" AS ENUM ('TEXTO_CURTO', 'PARAGRAFO', 'MULTIPLA_ESCOLHA', 'CAIXAS_SELECAO', 'LISTA_SUSPENSA', 'ESCALA_LINEAR');

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'RASCUNHO',
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "ownerSectorId" TEXT,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormSection" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FormSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormQuestion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "kind" "FormQuestionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "scaleMin" INTEGER,
    "scaleMax" INTEGER,
    "scaleMinLabel" TEXT,
    "scaleMaxLabel" TEXT,
    CONSTRAINT "FormQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FormOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormAssignment" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "FormAssignmentStatus" NOT NULL DEFAULT 'PENDENTE',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "respondentId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT,
    "number" INTEGER,
    "optionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "FormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Form_status_idx" ON "Form"("status");
CREATE INDEX "Form_ownerSectorId_idx" ON "Form"("ownerSectorId");
CREATE INDEX "FormSection_formId_order_idx" ON "FormSection"("formId", "order");
CREATE INDEX "FormQuestion_sectionId_order_idx" ON "FormQuestion"("sectionId", "order");
CREATE INDEX "FormOption_questionId_order_idx" ON "FormOption"("questionId", "order");
CREATE UNIQUE INDEX "FormAssignment_formId_userId_key" ON "FormAssignment"("formId", "userId");
CREATE INDEX "FormAssignment_userId_status_idx" ON "FormAssignment"("userId", "status");
CREATE INDEX "FormResponse_formId_idx" ON "FormResponse"("formId");
CREATE UNIQUE INDEX "FormAnswer_responseId_questionId_key" ON "FormAnswer"("responseId", "questionId");
CREATE INDEX "FormAnswer_questionId_idx" ON "FormAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_ownerSectorId_fkey" FOREIGN KEY ("ownerSectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormSection" ADD CONSTRAINT "FormSection_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "FormSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormOption" ADD CONSTRAINT "FormOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FormQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormAssignment" ADD CONSTRAINT "FormAssignment_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormAssignment" ADD CONSTRAINT "FormAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FormResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FormQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 9: Criar os tipos de domínio**

Criar `src/types/form.ts`:

```ts
export type FormStatus = "RASCUNHO" | "PUBLICADO" | "ENCERRADO";

export type FormQuestionKind =
  | "TEXTO_CURTO"
  | "PARAGRAFO"
  | "MULTIPLA_ESCOLHA"
  | "CAIXAS_SELECAO"
  | "LISTA_SUSPENSA"
  | "ESCALA_LINEAR";

/** Tipos que exigem ao menos uma opção cadastrada. */
export const KINDS_WITH_OPTIONS: readonly FormQuestionKind[] = [
  "MULTIPLA_ESCOLHA",
  "CAIXAS_SELECAO",
  "LISTA_SUSPENSA",
];

/** Rótulo de cada tipo no seletor do construtor. */
export const QUESTION_KIND_LABEL: Record<FormQuestionKind, string> = {
  TEXTO_CURTO: "Resposta curta",
  PARAGRAFO: "Parágrafo",
  MULTIPLA_ESCOLHA: "Múltipla escolha",
  CAIXAS_SELECAO: "Caixas de seleção",
  LISTA_SUSPENSA: "Lista suspensa",
  ESCALA_LINEAR: "Escala linear",
};

export interface FormOptionDraft {
  id: string;
  label: string;
  order: number;
}

export interface FormQuestionDraft {
  id: string;
  kind: FormQuestionKind;
  label: string;
  helpText?: string;
  required: boolean;
  order: number;
  options: FormOptionDraft[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

export interface FormSectionDraft {
  id: string;
  title: string;
  description?: string;
  order: number;
  questions: FormQuestionDraft[];
}

/** Formulário completo, para o construtor e para o preenchimento. */
export interface FormDraft {
  id: string;
  title: string;
  description?: string;
  status: FormStatus;
  anonymous: boolean;
  dueAt?: string;
  sections: FormSectionDraft[];
}

/** Linha da listagem no bloco "Formulários" do DHO. */
export interface FormListItem {
  id: string;
  title: string;
  status: FormStatus;
  anonymous: boolean;
  responseCount: number;
  assignedCount: number;
  createdAtLabel: string;
}

/** Uma resposta enviada, no formato que a Server Action recebe. */
export interface FormAnswerInput {
  questionId: string;
  text?: string;
  number?: number;
  optionIds?: string[];
}
```

- [ ] **Step 10: Gerar o client e verificar**

Run: `npx prisma generate && npm run typecheck && npm run lint && npm test`
Expected: tudo limpo; `npm test` com os 16 testes de visibilidade + 2 de permissão = 18.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260904120000_forms src/types/form.ts src/types/index.ts src/lib/permissions.ts src/lib/permissions.test.ts
git commit -m "Formulários do DHO: schema, tipos e a permissão forms.manage

Seis tabelas novas ao lado dos 5 instrumentos de avaliação, que não são
tocados. Aqueles guardam Int em EvaluationAnswer.value e têm uma escala só
por instrumento: não há onde um formulário com texto, opções e tipos por
pergunta caber.

FormAssignment é a pendência, separada da resposta. É o que permite cobrar
quem falta num formulário anônimo sem ligar ninguém ao que respondeu.

FormAnswer.optionIds é array e não FK: mantém 'uma linha por pergunta'
cravado no banco. O preço, sem integridade referencial, é coberto por travar
a estrutura depois da primeira resposta.

Migration puramente aditiva — nenhuma coluna existente muda."
```

---

## Task 2: Regras puras (edição travada, anonimato, quem pode responder)

**Files:**
- Create: `src/lib/forms/rules.ts`
- Test: `src/lib/forms/rules.test.ts`

**Interfaces:**
- Consumes: `FormStatus` de `src/types/form.ts`.
- Produces:
  - `canEditStructure(form: { status: FormStatus; responseCount: number }): boolean`
  - `canRespond(form: { status: FormStatus }, assignment: { status: "PENDENTE" | "CONCLUIDA" } | null): boolean`
  - `ANONYMITY_FLOOR: number` (= 5)
  - `showsAggregate(form: { anonymous: boolean }, responseCount: number): boolean`
  - `formScopeFor(viewer: { role: Role; sectorId: string | null }): { ownerSectorId: string } | null | "denied"` — `null` = sem recorte (ADMIN); `"denied"` = não lê nada. O retorno é a própria cláusula `where` do Prisma.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/forms/rules.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  ANONYMITY_FLOOR,
  canEditStructure,
  canRespond,
  formScopeFor,
  showsAggregate,
} from "./rules";

test("rascunho é sempre editável", () => {
  assert.equal(canEditStructure({ status: "RASCUNHO", responseCount: 0 }), true);
  // Rascunho não pode ter resposta, mas a regra não depende disso.
  assert.equal(canEditStructure({ status: "RASCUNHO", responseCount: 3 }), true);
});

test("publicado sem resposta ainda é editável", () => {
  assert.equal(canEditStructure({ status: "PUBLICADO", responseCount: 0 }), true);
});

test("a PRIMEIRA resposta trava a estrutura", () => {
  // Editar depois disto deixaria optionIds órfão e mudaria o significado do
  // que já foi respondido.
  assert.equal(canEditStructure({ status: "PUBLICADO", responseCount: 1 }), false);
});

test("encerrado nunca é editável", () => {
  assert.equal(canEditStructure({ status: "ENCERRADO", responseCount: 0 }), false);
});

test("responder exige publicado E atribuição pendente", () => {
  assert.equal(canRespond({ status: "PUBLICADO" }, { status: "PENDENTE" }), true);
});

test("quem já respondeu não responde de novo", () => {
  assert.equal(canRespond({ status: "PUBLICADO" }, { status: "CONCLUIDA" }), false);
});

test("sem atribuição não responde", () => {
  assert.equal(canRespond({ status: "PUBLICADO" }, null), false);
});

test("encerrado recusa mesmo quem estava pendente", () => {
  assert.equal(canRespond({ status: "ENCERRADO" }, { status: "PENDENTE" }), false);
});

test("rascunho não aceita resposta", () => {
  assert.equal(canRespond({ status: "RASCUNHO" }, { status: "PENDENTE" }), false);
});

test("formulário identificado exibe agregado com qualquer volume", () => {
  assert.equal(showsAggregate({ anonymous: false }, 1), true);
});

test("anônimo esconde o agregado abaixo do piso", () => {
  // Num grupo pequeno, o agregado É a resposta individual.
  assert.equal(showsAggregate({ anonymous: true }, ANONYMITY_FLOOR - 1), false);
  assert.equal(showsAggregate({ anonymous: true }, ANONYMITY_FLOOR), true);
});

test("ADMIN lê sem recorte", () => {
  assert.equal(formScopeFor({ role: "ADMIN", sectorId: "s1" }), null);
});

test("GESTOR é recortado pelo próprio setor", () => {
  assert.deepEqual(formScopeFor({ role: "GESTOR", sectorId: "s1" }), { ownerSectorId: "s1" });
});

test("GESTOR sem setor não alcança formulário nenhum", () => {
  // Sentinela em vez de null: `{ ownerSectorId: null }` casaria justamente com
  // os formulários corporativos do ADMIN, que o gestor não deve ler.
  const scope = formScopeFor({ role: "GESTOR", sectorId: null });
  assert.notEqual(scope, null);
  assert.notDeepEqual(scope, { ownerSectorId: null });
});

test("COLABORADOR não lê resultado nenhum", () => {
  assert.equal(formScopeFor({ role: "COLABORADOR", sectorId: "s1" }), "denied");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/forms/rules.test.ts`
Expected: FAIL — `Cannot find module './rules'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/forms/rules.ts`:

```ts
import type { Role } from "@/types";
import type { FormStatus } from "@/types/form";

/**
 * Regras do ciclo de vida de um formulário, em forma pura.
 *
 * Ficam aqui, sem Prisma nem React, porque são o que decide quem lê o quê — e
 * porque é o tipo de regra que precisa de teste, não de inspeção visual. As
 * Server Actions e as telas consultam estas funções; nenhuma reimplementa.
 */

/**
 * Estrutura editável.
 *
 * Rascunho: à vontade. Publicado sem resposta: também — corrigir um erro de
 * digitação antes de alguém responder é legítimo. Depois da PRIMEIRA resposta,
 * trava: apagar uma opção deixaria `FormAnswer.optionIds` apontando para o
 * nada e, pior, mudaria o significado do que já foi respondido.
 */
export function canEditStructure(form: {
  status: FormStatus;
  responseCount: number;
}): boolean {
  if (form.status === "ENCERRADO") return false;
  if (form.status === "RASCUNHO") return true;
  return form.responseCount === 0;
}

/**
 * Pode enviar resposta.
 *
 * Exige formulário PUBLICADO e uma atribuição ainda PENDENTE. Encerrar recusa
 * mesmo quem nunca respondeu: é o que congela o resultado para leitura.
 */
export function canRespond(
  form: { status: FormStatus },
  assignment: { status: "PENDENTE" | "CONCLUIDA" } | null,
): boolean {
  if (form.status !== "PUBLICADO") return false;
  return assignment?.status === "PENDENTE";
}

/**
 * Mínimo de respostas para exibir agregado de formulário anônimo.
 *
 * Num setor de duas pessoas, a média É a resposta individual. Sem este piso o
 * anônimo seria anônimo apenas no schema.
 */
export const ANONYMITY_FLOOR = 5;

export function showsAggregate(form: { anonymous: boolean }, responseCount: number): boolean {
  if (!form.anonymous) return true;
  return responseCount >= ANONYMITY_FLOOR;
}

/**
 * Recorte de leitura, na forma de cláusula `where` do Prisma.
 *
 * Devolve a CLÁUSULA, e não um predicado, de propósito: é a única forma de a
 * regra ser testada e usada no mesmo lugar. Um predicado exigiria filtrar
 * depois de carregar — e aí a consulta teria de repetir a regra por conta
 * própria, com dois lugares para divergir. A lição do quadro de chamados.
 *
 * ADMIN vê tudo. GESTOR vê só o do próprio setor — a mesma régua que já governa
 * os resultados de avaliação na mesma tela (ver `rh/page.tsx`), necessária
 * porque a porta do DHO é papel, não lotação: todo gestor de todo setor entra.
 *
 * Formulário com `ownerSectorId` nulo é da empresa, criado pelo ADMIN, e nenhum
 * gestor lê. Daí a sentinela para o gestor sem setor: filtrar por
 * `ownerSectorId: null` casaria justamente com os corporativos.
 */
export const NO_SECTOR = "__sem_setor__";

export function formScopeFor(viewer: {
  role: Role;
  sectorId: string | null;
}): { ownerSectorId: string } | null | "denied" {
  if (viewer.role === "ADMIN") return null;
  if (viewer.role !== "GESTOR") return "denied";
  return { ownerSectorId: viewer.sectorId ?? NO_SECTOR };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/forms/rules.test.ts`
Expected: PASS — 15 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forms/rules.ts src/lib/forms/rules.test.ts
git commit -m "Formulários: regras de ciclo de vida, com teste

Quatro decisões que precisam de teste e não de inspeção visual:

- A primeira resposta trava a estrutura. Editar depois deixaria optionIds
  órfão e mudaria o significado do que já foi respondido.
- Encerrado recusa resposta mesmo de quem estava pendente. É o que congela o
  resultado.
- Anônimo não exibe agregado abaixo de 5 respostas: num grupo pequeno a média
  é a resposta individual.
- Gestor lê só o do próprio setor, e não lê o corporativo do admin. Necessário
  porque a porta do DHO é papel, não lotação — todo gestor entra lá.

O recorte devolve a CLÁUSULA where, não um predicado: é o que faz a regra ser
testada e usada no mesmo lugar. Predicado exigiria filtrar depois de carregar,
e a consulta repetiria a regra por conta própria — dois lugares para divergir."
```

---

## Task 3: Validação da submissão

**Files:**
- Create: `src/lib/forms/validation.ts`
- Test: `src/lib/forms/validation.test.ts`

**Interfaces:**
- Consumes: `FormDraft`, `FormAnswerInput`, `KINDS_WITH_OPTIONS` de `src/types/form.ts`.
- Produces: `validateSubmission(form: FormDraft, answers: readonly FormAnswerInput[]): { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/forms/validation.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { validateSubmission } from "./validation";
import type { FormDraft, FormQuestionDraft } from "@/types/form";

function question(patch: Partial<FormQuestionDraft> = {}): FormQuestionDraft {
  return {
    id: "q1",
    kind: "TEXTO_CURTO",
    label: "Pergunta",
    required: false,
    order: 0,
    options: [],
    ...patch,
  };
}

function form(questions: FormQuestionDraft[]): FormDraft {
  return {
    id: "f1",
    title: "Formulário",
    status: "PUBLICADO",
    anonymous: false,
    sections: [{ id: "s1", title: "Seção", order: 0, questions }],
  };
}

test("texto válido passa", () => {
  const res = validateSubmission(form([question()]), [{ questionId: "q1", text: "oi" }]);
  assert.deepEqual(res, { ok: true });
});

test("obrigatória sem resposta é recusada", () => {
  const res = validateSubmission(form([question({ required: true })]), []);
  assert.equal(res.ok, false);
});

test("obrigatória com texto em branco é recusada", () => {
  // String de espaços não é resposta.
  const res = validateSubmission(form([question({ required: true })]), [
    { questionId: "q1", text: "   " },
  ]);
  assert.equal(res.ok, false);
});

test("opcional sem resposta passa", () => {
  assert.deepEqual(validateSubmission(form([question()]), []), { ok: true });
});

test("resposta a pergunta inexistente é recusada", () => {
  const res = validateSubmission(form([question()]), [{ questionId: "fantasma", text: "x" }]);
  assert.equal(res.ok, false);
});

test("múltipla escolha aceita exatamente uma opção", () => {
  const q = question({
    kind: "MULTIPLA_ESCOLHA",
    options: [
      { id: "o1", label: "A", order: 0 },
      { id: "o2", label: "B", order: 1 },
    ],
  });
  assert.deepEqual(validateSubmission(form([q]), [{ questionId: "q1", optionIds: ["o1"] }]), {
    ok: true,
  });
  const duas = validateSubmission(form([q]), [{ questionId: "q1", optionIds: ["o1", "o2"] }]);
  assert.equal(duas.ok, false);
});

test("caixas de seleção aceitam várias opções", () => {
  const q = question({
    kind: "CAIXAS_SELECAO",
    options: [
      { id: "o1", label: "A", order: 0 },
      { id: "o2", label: "B", order: 1 },
    ],
  });
  const res = validateSubmission(form([q]), [{ questionId: "q1", optionIds: ["o1", "o2"] }]);
  assert.deepEqual(res, { ok: true });
});

test("opção inexistente é recusada", () => {
  const q = question({
    kind: "MULTIPLA_ESCOLHA",
    options: [{ id: "o1", label: "A", order: 0 }],
  });
  const res = validateSubmission(form([q]), [{ questionId: "q1", optionIds: ["o9"] }]);
  assert.equal(res.ok, false);
});

test("texto enviado a pergunta de escala é recusado", () => {
  const q = question({ kind: "ESCALA_LINEAR", scaleMin: 1, scaleMax: 5 });
  const res = validateSubmission(form([q]), [{ questionId: "q1", text: "quatro" }]);
  assert.equal(res.ok, false);
});

test("escala dentro do intervalo passa; fora é recusada", () => {
  const q = question({ kind: "ESCALA_LINEAR", scaleMin: 1, scaleMax: 5 });
  assert.deepEqual(validateSubmission(form([q]), [{ questionId: "q1", number: 5 }]), { ok: true });
  assert.equal(validateSubmission(form([q]), [{ questionId: "q1", number: 6 }]).ok, false);
  assert.equal(validateSubmission(form([q]), [{ questionId: "q1", number: 0 }]).ok, false);
});

test("escala com valor fracionário é recusada", () => {
  const q = question({ kind: "ESCALA_LINEAR", scaleMin: 1, scaleMax: 5 });
  assert.equal(validateSubmission(form([q]), [{ questionId: "q1", number: 3.5 }]).ok, false);
});

test("duas respostas para a mesma pergunta são recusadas", () => {
  const res = validateSubmission(form([question()]), [
    { questionId: "q1", text: "a" },
    { questionId: "q1", text: "b" },
  ]);
  assert.equal(res.ok, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/forms/validation.test.ts`
Expected: FAIL — `Cannot find module './validation'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/forms/validation.ts`:

```ts
import { KINDS_WITH_OPTIONS } from "@/types/form";
import type { FormAnswerInput, FormDraft, FormQuestionDraft } from "@/types/form";

/**
 * Valida uma submissão contra a definição do formulário.
 *
 * Roda no SERVIDOR antes de gravar. A tela também impede o inválido, mas a
 * Server Action recebe o que o cliente mandar — inclusive de um cliente que
 * não é a tela.
 *
 * Devolve a primeira falha encontrada, com mensagem em português pronta para
 * exibição: quem envia formulário quer saber o que corrigir, não uma lista.
 */
export type ValidationResult = { ok: true } | { ok: false; error: string };

function isAnswered(question: FormQuestionDraft, answer: FormAnswerInput | undefined): boolean {
  if (!answer) return false;
  if (question.kind === "ESCALA_LINEAR") return typeof answer.number === "number";
  if (KINDS_WITH_OPTIONS.includes(question.kind)) return (answer.optionIds?.length ?? 0) > 0;
  return (answer.text ?? "").trim().length > 0;
}

function validateOne(
  question: FormQuestionDraft,
  answer: FormAnswerInput | undefined,
): string | null {
  const answered = isAnswered(question, answer);

  if (question.required && !answered) {
    return `Responda "${question.label}".`;
  }
  if (!answer || !answered) return null;

  switch (question.kind) {
    case "TEXTO_CURTO":
    case "PARAGRAFO": {
      if (answer.number !== undefined || (answer.optionIds?.length ?? 0) > 0) {
        return `"${question.label}" espera texto.`;
      }
      return null;
    }

    case "ESCALA_LINEAR": {
      if (answer.text !== undefined || (answer.optionIds?.length ?? 0) > 0) {
        return `"${question.label}" espera um valor da escala.`;
      }
      const value = answer.number as number;
      if (!Number.isInteger(value)) {
        return `"${question.label}" aceita apenas valores inteiros.`;
      }
      const min = question.scaleMin ?? 1;
      const max = question.scaleMax ?? 5;
      if (value < min || value > max) {
        return `"${question.label}" aceita valores de ${min} a ${max}.`;
      }
      return null;
    }

    default: {
      // MULTIPLA_ESCOLHA, CAIXAS_SELECAO, LISTA_SUSPENSA
      if (answer.text !== undefined || answer.number !== undefined) {
        return `"${question.label}" espera uma opção.`;
      }
      const chosen = answer.optionIds ?? [];
      const valid = new Set(question.options.map((o) => o.id));
      if (chosen.some((id) => !valid.has(id))) {
        return `Opção inválida em "${question.label}".`;
      }
      // Só as caixas aceitam mais de uma; escolha única e lista aceitam uma.
      if (question.kind !== "CAIXAS_SELECAO" && chosen.length > 1) {
        return `"${question.label}" aceita apenas uma opção.`;
      }
      return null;
    }
  }
}

export function validateSubmission(
  form: FormDraft,
  answers: readonly FormAnswerInput[],
): ValidationResult {
  const questions = form.sections.flatMap((s) => s.questions);
  const known = new Set(questions.map((q) => q.id));

  const seen = new Set<string>();
  for (const answer of answers) {
    if (!known.has(answer.questionId)) {
      return { ok: false, error: "A resposta não corresponde a este formulário." };
    }
    if (seen.has(answer.questionId)) {
      return { ok: false, error: "Há duas respostas para a mesma pergunta." };
    }
    seen.add(answer.questionId);
  }

  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  for (const question of questions) {
    const problem = validateOne(question, byQuestion.get(question.id));
    if (problem) return { ok: false, error: problem };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/forms/validation.test.ts`
Expected: PASS — 12 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 45 testes passando, typecheck e lint limpos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/forms/validation.ts src/lib/forms/validation.test.ts
git commit -m "Formulários: validação da submissão, com teste

Confere a resposta contra a definição do formulário no SERVIDOR. A tela já
impede o inválido, mas a Server Action recebe o que o cliente mandar —
inclusive de um cliente que não é a tela.

Cobre obrigatória em branco, pergunta inexistente, tipo incompatível com o
valor, opção que não pertence à pergunta, mais de uma opção onde só cabe uma,
escala fora do intervalo ou fracionária, e resposta duplicada.

Devolve a primeira falha com mensagem pronta: quem envia quer saber o que
corrigir, não uma lista."
```

---

## Task 4: Agregação para o dashboard

**Files:**
- Create: `src/lib/forms/aggregate.ts`
- Test: `src/lib/forms/aggregate.test.ts`

**Interfaces:**
- Consumes: `FormDraft`, `FormQuestionDraft` de `src/types/form.ts`.
- Produces:
  - `interface OptionTally { optionId: string; label: string; count: number; percent: number }`
  - `interface QuestionResult { questionId: string; label: string; kind: FormQuestionKind; answered: number; options?: OptionTally[]; scale?: { distribution: { value: number; count: number }[]; average: number | null }; texts?: string[] }`
  - `aggregate(form: FormDraft, responses: readonly { answers: readonly FormAnswerInput[] }[]): QuestionResult[]`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/forms/aggregate.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { aggregate } from "./aggregate";
import type { FormDraft, FormAnswerInput } from "@/types/form";

const form: FormDraft = {
  id: "f1",
  title: "Clima",
  status: "PUBLICADO",
  anonymous: true,
  sections: [
    {
      id: "s1",
      title: "Seção",
      order: 0,
      questions: [
        {
          id: "q1",
          kind: "MULTIPLA_ESCOLHA",
          label: "Turno",
          required: true,
          order: 0,
          options: [
            { id: "o1", label: "Manhã", order: 0 },
            { id: "o2", label: "Tarde", order: 1 },
          ],
        },
        {
          id: "q2",
          kind: "ESCALA_LINEAR",
          label: "Satisfação",
          required: true,
          order: 1,
          options: [],
          scaleMin: 1,
          scaleMax: 5,
        },
        {
          id: "q3",
          kind: "PARAGRAFO",
          label: "Comentário",
          required: false,
          order: 2,
          options: [],
        },
      ],
    },
  ],
};

const responses: { answers: FormAnswerInput[] }[] = [
  { answers: [{ questionId: "q1", optionIds: ["o1"] }, { questionId: "q2", number: 5 }] },
  { answers: [{ questionId: "q1", optionIds: ["o1"] }, { questionId: "q2", number: 3 }] },
  {
    answers: [
      { questionId: "q1", optionIds: ["o2"] },
      { questionId: "q2", number: 4 },
      { questionId: "q3", text: "tudo certo" },
    ],
  },
];

test("conta as opções e calcula o percentual sobre quem respondeu a pergunta", () => {
  const [q1] = aggregate(form, responses);
  assert.equal(q1?.answered, 3);
  assert.deepEqual(q1?.options, [
    { optionId: "o1", label: "Manhã", count: 2, percent: 67 },
    { optionId: "o2", label: "Tarde", count: 1, percent: 33 },
  ]);
});

test("a escala vem na ordem 1→N, com os valores sem resposta zerados", () => {
  // A ordem carrega significado; ordenar por volume destruiria a leitura.
  const q2 = aggregate(form, responses)[1];
  assert.deepEqual(
    q2?.scale?.distribution,
    [
      { value: 1, count: 0 },
      { value: 2, count: 0 },
      { value: 3, count: 1 },
      { value: 4, count: 1 },
      { value: 5, count: 1 },
    ],
  );
  assert.equal(q2?.scale?.average, 4);
});

test("texto vira lista, não agregado", () => {
  const q3 = aggregate(form, responses)[2];
  assert.deepEqual(q3?.texts, ["tudo certo"]);
  assert.equal(q3?.answered, 1);
});

test("pergunta sem nenhuma resposta não divide por zero", () => {
  const vazio = aggregate(form, []);
  assert.equal(vazio[0]?.answered, 0);
  assert.deepEqual(vazio[0]?.options, [
    { optionId: "o1", label: "Manhã", count: 0, percent: 0 },
    { optionId: "o2", label: "Tarde", count: 0, percent: 0 },
  ]);
  assert.equal(vazio[1]?.scale?.average, null);
});

test("caixas de seleção contam cada opção marcada", () => {
  const multi: FormDraft = {
    ...form,
    sections: [
      {
        ...form.sections[0]!,
        questions: [{ ...form.sections[0]!.questions[0]!, kind: "CAIXAS_SELECAO" }],
      },
    ],
  };
  const [q] = aggregate(multi, [{ answers: [{ questionId: "q1", optionIds: ["o1", "o2"] }] }]);
  assert.equal(q?.answered, 1);
  assert.equal(q?.options?.[0]?.count, 1);
  assert.equal(q?.options?.[1]?.count, 1);
  // Percentual sobre respondentes, não sobre marcações: 1 de 1 marcou cada uma.
  assert.equal(q?.options?.[0]?.percent, 100);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/forms/aggregate.test.ts`
Expected: FAIL — `Cannot find module './aggregate'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/forms/aggregate.ts`:

```ts
import { KINDS_WITH_OPTIONS } from "@/types/form";
import type { FormAnswerInput, FormDraft, FormQuestionKind } from "@/types/form";

/**
 * Agregação das respostas para o dashboard.
 *
 * Pura de propósito: recebe o formulário e as respostas já carregadas, e não
 * conhece Prisma. É o que permite testar a contagem, o percentual e a média
 * sem banco — e são justamente essas três contas que ninguém confere no olho.
 */

export interface OptionTally {
  optionId: string;
  label: string;
  count: number;
  /** Percentual sobre QUEM RESPONDEU a pergunta, arredondado. */
  percent: number;
}

export interface QuestionResult {
  questionId: string;
  label: string;
  kind: FormQuestionKind;
  /** Quantas pessoas responderam esta pergunta (opcional pode ficar em branco). */
  answered: number;
  /** Escolha, caixas, lista. Sempre com TODAS as opções, inclusive as zeradas. */
  options?: OptionTally[];
  /** Escala linear. */
  scale?: {
    /** Na ordem scaleMin→scaleMax, com os valores sem resposta zerados. */
    distribution: { value: number; count: number }[];
    /** Média com 2 casas, ou null quando ninguém respondeu. */
    average: number | null;
  };
  /** Texto e parágrafo: as respostas, na ordem de envio. */
  texts?: string[];
}

export function aggregate(
  form: FormDraft,
  responses: readonly { answers: readonly FormAnswerInput[] }[],
): QuestionResult[] {
  const questions = form.sections.flatMap((s) => s.questions);

  return questions.map((question) => {
    const answers = responses
      .map((r) => r.answers.find((a) => a.questionId === question.id))
      .filter((a): a is FormAnswerInput => a !== undefined);

    if (KINDS_WITH_OPTIONS.includes(question.kind)) {
      const respondents = answers.filter((a) => (a.optionIds?.length ?? 0) > 0);
      const counts = new Map<string, number>();
      for (const answer of respondents) {
        for (const id of answer.optionIds ?? []) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      const total = respondents.length;
      return {
        questionId: question.id,
        label: question.label,
        kind: question.kind,
        answered: total,
        // Opção sem nenhuma marcação continua na lista: "ninguém escolheu" é
        // resultado, e some se a barra não for desenhada.
        options: [...question.options]
          .sort((a, b) => a.order - b.order)
          .map((option) => {
            const count = counts.get(option.id) ?? 0;
            return {
              optionId: option.id,
              label: option.label,
              count,
              percent: total === 0 ? 0 : Math.round((count / total) * 100),
            };
          }),
      };
    }

    if (question.kind === "ESCALA_LINEAR") {
      const min = question.scaleMin ?? 1;
      const max = question.scaleMax ?? 5;
      const values = answers
        .map((a) => a.number)
        .filter((v): v is number => typeof v === "number");
      const counts = new Map<number, number>();
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

      const distribution: { value: number; count: number }[] = [];
      for (let value = min; value <= max; value += 1) {
        distribution.push({ value, count: counts.get(value) ?? 0 });
      }

      const average =
        values.length === 0
          ? null
          : Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;

      return {
        questionId: question.id,
        label: question.label,
        kind: question.kind,
        answered: values.length,
        scale: { distribution, average },
      };
    }

    const texts = answers
      .map((a) => (a.text ?? "").trim())
      .filter((t) => t.length > 0);
    return {
      questionId: question.id,
      label: question.label,
      kind: question.kind,
      answered: texts.length,
      texts,
    };
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/forms/aggregate.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forms/aggregate.ts src/lib/forms/aggregate.test.ts
git commit -m "Formulários: agregação das respostas, com teste

Pura de propósito — recebe formulário e respostas já carregados, sem conhecer
Prisma. É o que permite testar contagem, percentual e média sem banco, e são
justamente as três contas que ninguém confere no olho.

Duas decisões que o teste fixa: a escala sai na ordem 1→N com os valores sem
resposta zerados (a ordem carrega significado; ordenar por volume destruiria
a leitura), e opção sem marcação continua na lista, porque 'ninguém escolheu'
é resultado e some se a barra não for desenhada.

Percentual é sobre quem respondeu a pergunta, não sobre o total de respostas
do formulário: pergunta opcional em branco não deve encolher as barras."
```

---

## Task 5: Camada de dados e Server Actions do construtor

**Files:**
- Create: `src/lib/forms/data.ts`
- Create: `src/lib/forms/actions.ts`
- Modify: `src/lib/forms/rules.ts` (nada — só consumido)

**Interfaces:**
- Consumes: `canEditStructure`, `canReadForm` de `./rules`; tipos de `@/types/form`.
- Produces:
  - `getFormsForViewer(): Promise<FormListItem[]>`
  - `getFormDraft(formId: string): Promise<FormDraft | null>`
  - `createForm(): Promise<{ ok: boolean; id?: string; error?: string }>`
  - `saveForm(input: { formId: string; draft: FormDraft }): Promise<{ ok: boolean; error?: string }>`
  - `publishForm(input: { formId: string; userIds: string[]; sectorIds: string[]; anonymous: boolean; dueAt?: string }): Promise<{ ok: boolean; error?: string }>`
  - `closeForm(formId: string): Promise<{ ok: boolean; error?: string }>`
  - `listFormRecipients(): Promise<{ users: { id: string; name: string; sector: string }[]; sectors: { id: string; label: string }[] }>`

**Desvio consciente da spec §7.** A spec lista ações granulares (`upsertQuestion`,
`reorderQuestions`, `deleteQuestion`). O plano as consolida num `saveForm` que grava o
rascunho inteiro. É o que decorre de "salvar é explícito, não autosave": com o estado
vivendo no cliente até o botão, não há o que uma ação por pergunta sirva — e ela custaria
uma ida ao servidor por tecla, exatamente o que a decisão evitou. Se um dia entrar
autosave, as granulares voltam.

**Nota de implementação — o escopo do ator.** `getVerifiedSession()` devolve `sector` como **rótulo**, não id. Toda ação que precisa do `sectorId` faz:

```ts
const actor = await prisma.user.findUnique({
  where: { id: session.userId },
  select: { sectorId: true },
});
```

E o `ownerSectorId` gravado é `role === "ADMIN" ? null : actor?.sectorId ?? null`.
O recorte de LEITURA não se escreve aqui: vem de `formScopeFor` (Task 2), que é
onde a regra tem teste.

- [ ] **Step 1: Escrever a camada de leitura**

Criar `src/lib/forms/data.ts`:

```ts
import { prisma } from "@/lib/db/prisma";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { formScopeFor } from "./rules";
import type { Role } from "@/types";
import type { FormDraft, FormListItem, FormQuestionKind, FormStatus } from "@/types/form";

/**
 * Leitura dos formulários do DHO.
 *
 * O recorte por setor é CLÁUSULA DE CONSULTA, não filtro de tela: o gestor de
 * outro setor não recebe o formulário, em vez de recebê-lo e não vê-lo.
 */

/**
 * Escopo de leitura do ator, já na forma da cláusula `where`.
 * A regra em si mora em `./rules` — aqui só se resolve o setor do usuário.
 */
async function readScope() {
  const session = await getVerifiedSession();
  if (!session) return "denied" as const;
  const role = session.role as Role;
  if (!can(role, "forms.manage")) return "denied" as const;

  const actor = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sectorId: true },
  });
  return formScopeFor({ role, sectorId: actor?.sectorId ?? null });
}

function dateLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function getFormsForViewer(): Promise<FormListItem[]> {
  const scope = await readScope();
  if (scope === "denied") return [];

  const rows = await prisma.form.findMany({
    where: scope === null ? {} : { ownerSectorId: scope.ownerSectorId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      anonymous: true,
      createdAt: true,
      _count: { select: { responses: true, assignments: true } },
    },
  });

  return rows.map((f) => ({
    id: f.id,
    title: f.title,
    status: f.status as FormStatus,
    anonymous: f.anonymous,
    responseCount: f._count.responses,
    assignedCount: f._count.assignments,
    createdAtLabel: dateLabel(f.createdAt),
  }));
}

export async function getFormDraft(formId: string): Promise<FormDraft | null> {
  const scope = await readScope();
  if (scope === "denied") return null;

  const form = await prisma.form.findFirst({
    where: {
      id: formId,
      ...(scope === null ? {} : { ownerSectorId: scope.ownerSectorId }),
    },
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
  });
  if (!form) return null;

  return {
    id: form.id,
    title: form.title,
    description: form.description ?? undefined,
    status: form.status as FormStatus,
    anonymous: form.anonymous,
    dueAt: form.dueAt?.toISOString(),
    sections: form.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? undefined,
      order: s.order,
      questions: s.questions.map((q) => ({
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
    })),
  };
}
```

- [ ] **Step 2: Escrever as Server Actions**

Criar `src/lib/forms/actions.ts`. Ponto central: `saveForm` **substitui** seções/perguntas/opções em transação (apaga e recria), o que é seguro exatamente porque `canEditStructure` só permite salvar enquanto não há resposta.

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { canEditStructure, NO_SECTOR } from "./rules";
import type { Role } from "@/types";
import type { FormDraft } from "@/types/form";

export interface FormActionResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Ator autorizado + seu setor, ou null. */
async function actor(): Promise<{ id: string; role: Role; sectorId: string | null } | null> {
  const session = await getVerifiedSession();
  if (!session) return null;
  const role = session.role as Role;
  if (!can(role, "forms.manage")) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sectorId: true },
  });
  return { id: session.userId, role, sectorId: user?.sectorId ?? null };
}

/** Formulário que o ator pode editar, com a contagem que trava a estrutura. */
async function editableForm(formId: string, me: { role: Role; sectorId: string | null }) {
  return prisma.form.findFirst({
    where: {
      id: formId,
      ...(me.role === "ADMIN" ? {} : { ownerSectorId: me.sectorId ?? NO_SECTOR }),
    },
    select: { id: true, status: true, _count: { select: { responses: true } } },
  });
}

export async function createForm(): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sem permissão para criar formulários." };

  const form = await prisma.form.create({
    data: {
      title: "Formulário sem título",
      // ADMIN cria formulário da empresa (sem setor); gestor, do próprio setor.
      ownerSectorId: me.role === "ADMIN" ? null : me.sectorId,
      createdById: me.id,
      sections: {
        create: {
          title: "Seção 1",
          order: 0,
          questions: {
            create: {
              kind: "MULTIPLA_ESCOLHA",
              label: "Pergunta sem título",
              order: 0,
              options: { create: [{ label: "Opção 1", order: 0 }] },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  revalidatePath("/setores/rh");
  return { ok: true, id: form.id };
}

const draftSchema = z.object({
  formId: z.string().min(1),
  draft: z.object({
    title: z.string().trim().min(1, "O formulário precisa de um título."),
    description: z.string().trim().optional(),
    sections: z
      .array(
        z.object({
          title: z.string().trim().min(1),
          description: z.string().trim().optional(),
          questions: z.array(
            z.object({
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
              options: z.array(z.object({ label: z.string().trim().min(1) })),
              scaleMin: z.number().int().optional(),
              scaleMax: z.number().int().optional(),
              scaleMinLabel: z.string().trim().optional(),
              scaleMaxLabel: z.string().trim().optional(),
            }),
          ),
        }),
      )
      .min(1, "O formulário precisa de ao menos uma seção."),
  }),
});

export async function saveForm(input: {
  formId: string;
  draft: FormDraft;
}): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sem permissão." };

  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const existing = await editableForm(input.formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };
  if (!canEditStructure({ status: existing.status, responseCount: existing._count.responses })) {
    return {
      ok: false,
      error: "Este formulário já recebeu respostas. Só título e descrição podem mudar.",
    };
  }

  const { draft } = parsed.data;

  // Substitui a estrutura inteira em transação. É seguro porque a guarda acima
  // garante zero respostas: não há FormAnswer apontando para as perguntas que
  // saem. O cascade do schema limpa perguntas e opções junto com as seções.
  await prisma.$transaction(async (tx) => {
    await tx.form.update({
      where: { id: input.formId },
      data: { title: draft.title, description: draft.description || null },
    });
    await tx.formSection.deleteMany({ where: { formId: input.formId } });
    for (const [si, section] of draft.sections.entries()) {
      await tx.formSection.create({
        data: {
          formId: input.formId,
          title: section.title,
          description: section.description || null,
          order: si,
          questions: {
            create: section.questions.map((q, qi) => ({
              kind: q.kind,
              label: q.label,
              helpText: q.helpText || null,
              required: q.required,
              order: qi,
              scaleMin: q.kind === "ESCALA_LINEAR" ? (q.scaleMin ?? 1) : null,
              scaleMax: q.kind === "ESCALA_LINEAR" ? (q.scaleMax ?? 5) : null,
              scaleMinLabel: q.scaleMinLabel || null,
              scaleMaxLabel: q.scaleMaxLabel || null,
              options: {
                create: q.options.map((o, oi) => ({ label: o.label, order: oi })),
              },
            })),
          },
        },
      });
    }
  });

  revalidatePath(`/setores/rh/formularios/${input.formId}`);
  revalidatePath("/setores/rh");
  return { ok: true };
}

const publishSchema = z.object({
  formId: z.string().min(1),
  userIds: z.array(z.string().min(1)),
  sectorIds: z.array(z.string().min(1)),
  anonymous: z.boolean(),
  dueAt: z.string().optional(),
});

export async function publishForm(input: {
  formId: string;
  userIds: string[];
  sectorIds: string[];
  anonymous: boolean;
  dueAt?: string;
}): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sem permissão." };

  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const existing = await editableForm(input.formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };
  if (existing.status !== "RASCUNHO") {
    return { ok: false, error: "Este formulário já foi publicado." };
  }

  // Resolve setores + pessoas para uma lista de destinatários. O GESTOR só
  // alcança gente do próprio setor: a cláusula é aplicada aqui, não confiando
  // no que a tela mandou.
  const recipients = await prisma.user.findMany({
    where: {
      active: true,
      ...(me.role === "ADMIN" ? {} : { sectorId: me.sectorId ?? NO_SECTOR }),
      OR: [
        { id: { in: parsed.data.userIds } },
        { sectorId: { in: parsed.data.sectorIds } },
      ],
    },
    select: { id: true },
  });

  if (recipients.length === 0) {
    return { ok: false, error: "Escolha ao menos um destinatário." };
  }

  await prisma.$transaction([
    prisma.form.update({
      where: { id: input.formId },
      data: {
        status: "PUBLICADO",
        anonymous: parsed.data.anonymous,
        publishedAt: new Date(),
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      },
    }),
    prisma.formAssignment.createMany({
      data: recipients.map((r) => ({ formId: input.formId, userId: r.id })),
      skipDuplicates: true,
    }),
  ]);

  revalidatePath("/setores/rh");
  revalidatePath("/minhas-avaliacoes");
  return { ok: true };
}

export async function closeForm(formId: string): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sem permissão." };

  const existing = await editableForm(formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };

  await prisma.form.update({
    where: { id: formId },
    data: { status: "ENCERRADO", closedAt: new Date() },
  });

  revalidatePath("/setores/rh");
  revalidatePath("/minhas-avaliacoes");
  return { ok: true };
}

export async function listFormRecipients(): Promise<{
  users: { id: string; name: string; sector: string }[];
  sectors: { id: string; label: string }[];
}> {
  const me = await actor();
  if (!me) return { users: [], sectors: [] };

  const scoped = me.role === "ADMIN" ? {} : { sectorId: me.sectorId ?? NO_SECTOR };

  const [users, sectors] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, ...scoped },
      select: { id: true, fullName: true, sector: { select: { label: true } } },
      orderBy: { fullName: "asc" },
    }),
    me.role === "ADMIN"
      ? prisma.sector.findMany({ select: { id: true, label: true }, orderBy: { order: "asc" } })
      : prisma.sector.findMany({
          where: { id: me.sectorId ?? NO_SECTOR },
          select: { id: true, label: true },
        }),
  ]);

  return {
    users: users.map((u) => ({ id: u.id, name: u.fullName, sector: u.sector?.label ?? "—" })),
    sectors,
  };
}
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo limpo.

- [ ] **Step 4: Commit**

```bash
git add src/lib/forms/data.ts src/lib/forms/actions.ts
git commit -m "Formulários: leitura e Server Actions do construtor

O recorte por setor é cláusula de consulta, não filtro de tela: o gestor de
outro setor não RECEBE o formulário, em vez de recebê-lo e não vê-lo. Vale
para a listagem, para abrir um formulário e para resolver destinatários — a
lista de quem pode receber é recortada no servidor, sem confiar no que a tela
mandou.

saveForm substitui a estrutura inteira em transação, apagando e recriando
seções. É seguro precisamente porque canEditStructure já garantiu zero
respostas: não há FormAnswer apontando para as perguntas que saem.

publishForm resolve pessoas + setores para uma lista e grava um
FormAssignment por destinatário. É esse registro que responde 'quem já
respondeu' — e é o que faz o anônimo funcionar sem contradição."
```

---

## Task 6: Preenchimento em "Minhas Avaliações"

**Files:**
- Create: `src/lib/forms/response-actions.ts`
- Modify: `src/types/evaluation.ts` (`MyEvaluationTask`)
- Modify: `src/lib/evaluation-rounds.ts` (`getMyEvaluationTasks`, `countMyPendingEvaluations`)
- Modify: `src/lib/forms/validation.ts` (exportar `isQuestionAnswered`)
- Modify: `src/components/me/my-evaluations-panel.tsx`
- Verificar (talvez sem mudança): `src/app/minhas-avaliacoes/page.tsx` — as tarefas de
  formulário já chegam por `getMyEvaluationTasks`; a página só muda se o painel passar a
  precisar de algo além de `tasks` e `forms`.
- Create: `src/components/forms/question-input.tsx`
- Create: `src/components/forms/form-response-modal.tsx`

**Interfaces:**
- Consumes: `validateSubmission` de `./validation`; `canRespond` de `./rules`; `getFormDraft` — **atenção:** `getFormDraft` é recortado por `forms.manage` e não serve ao respondente. Esta tarefa cria `getAssignedForm(formId)` em `response-actions.ts`, cuja guarda é a atribuição, não a permissão.
- Produces:
  - `getAssignedForm(formId: string): Promise<FormDraft | null>`
  - `submitFormResponse(input: { formId: string; answers: FormAnswerInput[] }): Promise<{ ok: boolean; error?: string }>`
  - `MyEvaluationTask` com `kind: "FEEDBACK" | "AUTOAVALIACAO" | "FORMULARIO"` e `formId?: string`

- [ ] **Step 1: Estender o tipo da tarefa**

Em `src/types/evaluation.ts`, substituir a interface `MyEvaluationTask`:

```ts
/** Tarefa na aba "Minhas avaliações" do usuário logado. */
export interface MyEvaluationTask {
  kind: "FEEDBACK" | "AUTOAVALIACAO" | "FORMULARIO";
  /** Rodada de avaliação. Vazio nas tarefas de formulário. */
  roundId: string;
  /** Formulário do DHO. Preenchido só quando kind === "FORMULARIO". */
  formId?: string;
  typeSlug: string;
  typeTitle: string;
  /** Nome do avaliado (ou "Você" na autoavaliação). */
  subjectName: string;
  self: boolean;
}
```

- [ ] **Step 2: Somar formulários à lista e à contagem**

Em `src/lib/evaluation-rounds.ts`, ao final de `getMyEvaluationTasks`, antes do `return tasks`:

```ts
  // 3) Formulários do DHO atribuídos e ainda não respondidos. Só de
  //    formulários PUBLICADOS: encerrar congela o resultado e a tarefa some.
  const formAssignments = await prisma.formAssignment.findMany({
    where: { userId, status: "PENDENTE", form: { status: "PUBLICADO" } },
    orderBy: { createdAt: "asc" },
    select: { form: { select: { id: true, title: true } } },
  });
  for (const a of formAssignments) {
    tasks.push({
      kind: "FORMULARIO",
      roundId: "",
      formId: a.form.id,
      typeSlug: "formulario",
      typeTitle: "Formulário do DHO",
      subjectName: a.form.title,
      self: false,
    });
  }
```

E em `countMyPendingEvaluations`, acrescentar a terceira contagem ao `Promise.all`:

```ts
  const [feedback, selfAssessment, forms] = await Promise.all([
    // … as duas existentes …
    prisma.formAssignment.count({
      where: { userId, status: "PENDENTE", form: { status: "PUBLICADO" } },
    }),
  ]);

  return feedback + selfAssessment + forms;
```

- [ ] **Step 3: Escrever a ação de submissão**

Criar `src/lib/forms/response-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { canRespond } from "./rules";
import { validateSubmission } from "./validation";
import type { FormAnswerInput, FormDraft, FormQuestionKind, FormStatus } from "@/types/form";

/**
 * Preenchimento de formulário pelo destinatário.
 *
 * Guarda diferente da do construtor, e por isso em arquivo separado: aqui o que
 * autoriza é a ATRIBUIÇÃO, não `forms.manage`. Quem responde é colaborador e
 * não tem — nem deve ter — permissão de gestão.
 */

/** O formulário que o usuário logado foi designado a responder. */
export async function getAssignedForm(formId: string): Promise<FormDraft | null> {
  const session = await getVerifiedSession();
  if (!session) return null;

  const assignment = await prisma.formAssignment.findUnique({
    where: { formId_userId: { formId, userId: session.userId } },
    select: { status: true },
  });
  if (!assignment) return null;

  const form = await prisma.form.findUnique({
    where: { id: formId },
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
  });
  if (!form) return null;
  if (!canRespond({ status: form.status as FormStatus }, assignment)) return null;

  return {
    id: form.id,
    title: form.title,
    description: form.description ?? undefined,
    status: form.status as FormStatus,
    anonymous: form.anonymous,
    dueAt: form.dueAt?.toISOString(),
    sections: form.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? undefined,
      order: s.order,
      questions: s.questions.map((q) => ({
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
    })),
  };
}

export async function submitFormResponse(input: {
  formId: string;
  answers: FormAnswerInput[];
}): Promise<{ ok: boolean; error?: string }> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const form = await getAssignedForm(input.formId);
  if (!form) {
    return { ok: false, error: "Este formulário não está disponível para você." };
  }

  const check = validateSubmission(form, input.answers);
  if (!check.ok) return { ok: false, error: check.error };

  try {
    await prisma.$transaction(async (tx) => {
      // Marca a atribuição PRIMEIRO, condicionada a ainda estar pendente. Dois
      // envios simultâneos: o segundo encontra count 0 e a transação inteira é
      // desfeita, em vez de gravar resposta duplicada.
      const claimed = await tx.formAssignment.updateMany({
        where: { formId: input.formId, userId: session.userId, status: "PENDENTE" },
        data: { status: "CONCLUIDA", respondedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new Error("JA_RESPONDIDO");
      }

      await tx.formResponse.create({
        data: {
          formId: input.formId,
          // Anônimo NÃO grava o autor. Quem falta responder sai da atribuição.
          respondentId: form.anonymous ? null : session.userId,
          answers: {
            create: input.answers.map((a) => ({
              questionId: a.questionId,
              text: a.text?.trim() || null,
              number: a.number ?? null,
              optionIds: a.optionIds ?? [],
            })),
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "JA_RESPONDIDO") {
      return { ok: false, error: "Você já respondeu este formulário." };
    }
    console.error("[submitFormResponse] falha:", error);
    return { ok: false, error: "Não foi possível enviar suas respostas." };
  }

  revalidatePath("/minhas-avaliacoes");
  return { ok: true };
}
```

- [ ] **Step 4: Criar o campo por tipo**

Criar `src/components/forms/question-input.tsx` — um componente controlado que despacha por `kind`, usando `Input`, `Textarea`, `Select` e botões de rádio/checkbox já existentes em `src/components/ui/`. Assinatura:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormAnswerInput, FormQuestionDraft } from "@/types/form";

export interface QuestionInputProps {
  question: FormQuestionDraft;
  value: FormAnswerInput | undefined;
  onChange: (answer: FormAnswerInput) => void;
}

export function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  const id = `q-${question.id}`;

  switch (question.kind) {
    case "TEXTO_CURTO":
      return (
        <Input
          id={id}
          value={value?.text ?? ""}
          onChange={(e) => onChange({ questionId: question.id, text: e.target.value })}
          className="h-11 rounded-xl"
        />
      );

    case "PARAGRAFO":
      return (
        <Textarea
          id={id}
          rows={4}
          value={value?.text ?? ""}
          onChange={(e) => onChange({ questionId: question.id, text: e.target.value })}
        />
      );

    case "LISTA_SUSPENSA":
      return (
        <Select
          id={id}
          placeholder="Selecione"
          options={question.options.map((o) => ({ value: o.id, label: o.label }))}
          value={value?.optionIds?.[0] ?? ""}
          onChange={(e) => onChange({ questionId: question.id, optionIds: [e.target.value] })}
        />
      );

    case "MULTIPLA_ESCOLHA":
      return (
        <div role="radiogroup" aria-labelledby={id} className="space-y-2">
          {question.options.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name={id}
                checked={value?.optionIds?.[0] === option.id}
                onChange={() => onChange({ questionId: question.id, optionIds: [option.id] })}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-foreground">{option.label}</span>
            </label>
          ))}
        </div>
      );

    case "CAIXAS_SELECAO":
      return (
        <div className="space-y-2">
          {question.options.map((option) => {
            const chosen = value?.optionIds ?? [];
            const checked = chosen.includes(option.id);
            return (
              <label key={option.id} className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      questionId: question.id,
                      optionIds: checked
                        ? chosen.filter((c) => c !== option.id)
                        : [...chosen, option.id],
                    })
                  }
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-foreground">{option.label}</span>
              </label>
            );
          })}
        </div>
      );

    default: {
      // ESCALA_LINEAR
      const min = question.scaleMin ?? 1;
      const max = question.scaleMax ?? 5;
      const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div>
          <div
            role="radiogroup"
            aria-labelledby={id}
            // Mesma lição do formulário de avaliação: overflow-y-hidden evita
            // que o navegador materialize barra vertical, e o padding dá folga
            // para o anel do botão ativo não ser recortado.
            className="scrollbar-slim flex items-center gap-3 overflow-x-auto overflow-y-hidden px-0.5 py-1"
          >
            {values.map((v) => {
              const active = value?.number === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ questionId: question.id, number: v })}
                  className={
                    "focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 font-bold transition-all " +
                    (active
                      ? "border-accent bg-accent text-white shadow-md ring-2 ring-accent/40"
                      : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground")
                  }
                >
                  {v}
                </button>
              );
            })}
          </div>
          {(question.scaleMinLabel || question.scaleMaxLabel) && (
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{question.scaleMinLabel}</span>
              <span>{question.scaleMaxLabel}</span>
            </div>
          )}
        </div>
      );
    }
  }
}
```

- [ ] **Step 5: Criar o modal de preenchimento**

Criar `src/components/forms/form-response-modal.tsx`, paginado por seção, com o mesmo esqueleto do `EvaluationFormModal` (cabeçalho, `Progress`, corpo rolável, rodapé Voltar/Próximo/Enviar), renderizando `<QuestionInput>` por pergunta. Marcar as obrigatórias com `*` e bloquear "Próximo" enquanto houver obrigatória da seção sem resposta, usando `isAnswered` — **importe a mesma noção de "respondida" da validação** para as duas não divergirem. Exportar de `validation.ts`:

```ts
export function isQuestionAnswered(
  question: FormQuestionDraft,
  answer: FormAnswerInput | undefined,
): boolean {
  return isAnswered(question, answer);
}
```

- [ ] **Step 6: Ligar em "Minhas Avaliações"**

Em `src/components/me/my-evaluations-panel.tsx`, no `start(task)`, desviar as tarefas de formulário para o novo modal (carregando o `FormDraft` com `getAssignedForm(task.formId)`), e no cartão exibir "Responder" no lugar de "Preencher" quando `t.kind === "FORMULARIO"`, com `Badge tone="accent"` e rótulo "Formulário".

- [ ] **Step 7: Verificar**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tudo limpo.

- [ ] **Step 8: Commit**

```bash
git add src/lib/forms/response-actions.ts src/components/forms/question-input.tsx src/components/forms/form-response-modal.tsx src/types/evaluation.ts src/lib/evaluation-rounds.ts src/lib/forms/validation.ts src/components/me/my-evaluations-panel.tsx src/app/minhas-avaliacoes/page.tsx
git commit -m "Formulários: preenchimento em Minhas Avaliações

A guarda do preenchimento é a ATRIBUIÇÃO, não forms.manage — quem responde é
colaborador e não tem, nem deve ter, permissão de gestão. Por isso em arquivo
separado do construtor.

A submissão marca a atribuição PRIMEIRO, condicionada a ainda estar pendente:
dois envios simultâneos fazem o segundo encontrar count 0 e desfazem a
transação inteira, em vez de gravar resposta duplicada.

Formulário anônimo não grava o autor da resposta; quem falta responder
continua saindo da atribuição. É o que permite cobrar sem identificar.

O indicador vermelho da sidebar passa a contar formulários sem nenhuma
mudança de UI — só a terceira parcela em countMyPendingEvaluations."
```

---

## Task 7: Construtor

**Files:**
- Create: `src/app/setores/rh/formularios/[id]/page.tsx`
- Create: `src/components/forms/form-builder.tsx`
- Create: `src/components/forms/question-editor.tsx`
- Create: `src/components/forms/publish-modal.tsx`

**Interfaces:**
- Consumes: `getFormDraft` de `../data`; `saveForm`, `publishForm`, `listFormRecipients` de `../actions`; `QUESTION_KIND_LABEL`, `KINDS_WITH_OPTIONS` de `@/types/form`.
- Produces: nada consumido por tarefas posteriores.

- [ ] **Step 1: Página com a mesma guarda do DHO**

Criar `src/app/setores/rh/formularios/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { getFormDraft } from "@/lib/forms/data";
import { FormBuilder } from "@/components/forms/form-builder";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (!can(session.role as Role, "forms.manage")) notFound();

  const { id } = await params;
  // getFormDraft já recorta por setor: o gestor de outro setor recebe null,
  // não um formulário que a tela precisaria esconder.
  const draft = await getFormDraft(id);
  if (!draft) notFound();

  return <FormBuilder initial={draft} />;
}
```

- [ ] **Step 2: Editor de pergunta**

Criar `src/components/forms/question-editor.tsx` com esta interface exata:

```tsx
export interface QuestionEditorProps {
  question: FormQuestionDraft;
  /** Numeração exibida (1-based, contínua entre seções). */
  index: number;
  onChange: (patch: Partial<FormQuestionDraft>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Formulário já respondido: estrutura travada. */
  disabled: boolean;
}
```

Trocar de tipo preserva `label`, `helpText` e `required`; zera `options` ao sair de um
tipo com opções, e preenche `scaleMin: 1` / `scaleMax: 5` ao entrar em `ESCALA_LINEAR`.

Layout: Layout espelhando a referência — enunciado à esquerda, `Select` de tipo à direita, opções abaixo com "Adicionar opção", e rodapé com duplicar, excluir e o interruptor "Obrigatória". Para `ESCALA_LINEAR`, dois `Select` (mínimo 0–1, máximo 2–10) e dois `Input` de rótulo. Reordenação por botões ↑/↓, **não por drag** — teclado e leitor de tela funcionam de graça, e o drag pode entrar depois sem mudar o modelo de dados.

- [ ] **Step 3: Casca do construtor**

Criar `src/components/forms/form-builder.tsx` com esta interface exata:

```tsx
export interface FormBuilderProps {
  /** Rascunho vindo do servidor. Vira estado local até "Salvar". */
  initial: FormDraft;
}
```

Conteúdo: estado local do `FormDraft` inteiro, cabeçalho com título/descrição editáveis, lista de seções e perguntas, botões "Adicionar pergunta" e "Adicionar seção", e barra fixa com "Salvar" e "Publicar". Quando `status !== "RASCUNHO"` ou já houver respostas, desabilitar a edição estrutural e exibir o aviso: "Este formulário já recebeu respostas. Só título e descrição podem mudar."

Ids locais de perguntas e opções novas usam `crypto.randomUUID()` — são descartados no `saveForm`, que recria a estrutura e devolve ids do banco no próximo carregamento.

- [ ] **Step 4: Modal de publicação**

Criar `src/components/forms/publish-modal.tsx` com esta interface exata:

```tsx
export interface PublishModalProps {
  open: boolean;
  formId: string;
  onClose: () => void;
  /** Publicado com sucesso: o construtor recarrega em modo travado. */
  onPublished: () => void;
}
```

Conteúdo: carrega `listFormRecipients()` ao abrir; duas listas com busca (pessoas e setores) em `MultiChipGroup`; interruptor "Respostas anônimas" com o texto explicativo — "Ninguém, nem o DHO, saberá quem respondeu o quê. Você continua vendo quem ainda não respondeu." — e um campo de prazo opcional. Confirmar chama `publishForm`.

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tudo limpo.

- [ ] **Step 6: Commit**

```bash
git add src/app/setores/rh/formularios src/components/forms/form-builder.tsx src/components/forms/question-editor.tsx src/components/forms/publish-modal.tsx
git commit -m "Formulários: o construtor

Página cheia, e não modal: a coluna de perguntas com barra de ferramentas
lateral não cabe dentro de uma aba.

Salvar é explícito, não autosave. O Google Forms grava a cada tecla; aqui
isso seria uma Server Action por caractere.

Reordenação por botões, não por drag: teclado e leitor de tela funcionam de
graça. Drag pode entrar depois sem tocar no modelo de dados.

Publicado com resposta desabilita a edição estrutural na tela, com o motivo
escrito — a mesma regra que a Server Action já recusa no servidor."
```

---

## Task 8: Bloco no DHO e dashboard de resultados

**Files:**
- Create: `src/components/hr/forms-panel.tsx`
- Create: `src/components/forms/form-dashboard.tsx`
- Create: `src/components/forms/answer-bars.tsx`
- Modify: `src/lib/forms/data.ts` (acrescentar `getFormResults`)
- Modify: `src/app/setores/rh/page.tsx` (buscar os formulários)
- Modify: `src/components/hr/hr-sector-view.tsx` (passar adiante)
- Modify: `src/components/hr/evaluation-results-panel.tsx` (renderizar o bloco)

**Interfaces:**
- Consumes: `aggregate`, `QuestionResult` de `../aggregate`; `showsAggregate`, `ANONYMITY_FLOOR` de `../rules`; `getFormsForViewer` de `../data`.
- Produces: `getFormResults(formId)` devolvendo `{ form: FormDraft; results: QuestionResult[]; responseCount: number; assignedCount: number; pending: { id: string; name: string }[] }`.

- [ ] **Step 1: Consulta dos resultados**

Acrescentar a `src/lib/forms/data.ts`:

```ts
import { aggregate, type QuestionResult } from "./aggregate";

export interface FormResults {
  form: FormDraft;
  results: QuestionResult[];
  responseCount: number;
  assignedCount: number;
  /** Quem ainda não respondeu. Funciona mesmo no anônimo: sai da atribuição. */
  pending: { id: string; name: string }[];
}

export async function getFormResults(formId: string): Promise<FormResults | null> {
  const form = await getFormDraft(formId);
  if (!form) return null;

  const [responses, assignments] = await Promise.all([
    prisma.formResponse.findMany({
      where: { formId },
      select: { answers: { select: { questionId: true, text: true, number: true, optionIds: true } } },
    }),
    prisma.formAssignment.findMany({
      where: { formId },
      select: { status: true, user: { select: { id: true, fullName: true, active: true } } },
    }),
  ]);

  return {
    form,
    results: aggregate(
      form,
      responses.map((r) => ({
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          text: a.text ?? undefined,
          number: a.number ?? undefined,
          optionIds: a.optionIds,
        })),
      })),
    ),
    responseCount: responses.length,
    assignedCount: assignments.length,
    // Usuário desativado sai da cobrança: pendência dele não é acionável.
    pending: assignments
      .filter((a) => a.status === "PENDENTE" && a.user.active)
      .map((a) => ({ id: a.user.id, name: a.user.fullName })),
  };
}
```

- [ ] **Step 2: Barras de resposta**

Criar `src/components/forms/answer-bars.tsx`. **Uma cor só, `accent`** — nunca `primary` (reprova contraste no tema claro) e nunca cor por opção (ilegível no daltonismo e semanticamente vazia, já que o rótulo está ao lado):

```tsx
import type { OptionTally } from "@/lib/forms/aggregate";

export function AnswerBars({ options }: { options: readonly OptionTally[] }) {
  const max = Math.max(1, ...options.map((o) => o.count));

  return (
    <div className="space-y-2.5">
      {options.map((option) => (
        <div key={option.optionId} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-foreground" title={option.label}>
            {option.label}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-surface-3">
            <div
              className="h-full rounded-md bg-accent transition-[width] duration-300"
              style={{ width: `${(option.count / max) * 100}%` }}
            />
          </div>
          {/* Valor escrito: a identidade nunca depende só da cor. */}
          <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted">
            {option.count} · {option.percent}%
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Dashboard**

Criar `src/components/forms/form-dashboard.tsx`: faixa de `KpiTile` (respostas, taxa de resposta, quantos faltam, status), e um cartão por pergunta despachando pela forma da spec — `AnswerBars` para opções, barras verticais na ordem 1→N mais a média em número grande para escala, e lista com busca para texto. Quando `!showsAggregate(form, responseCount)`, substituir os gráficos pelo aviso:

> "Poucas respostas para exibir o resultado sem identificar quem respondeu. Os gráficos aparecem a partir de {ANONYMITY_FLOOR} respostas."

- [ ] **Step 4: Bloco no DHO**

Criar `src/components/hr/forms-panel.tsx` com esta interface exata:

```tsx
export interface FormsPanelProps {
  forms: readonly FormListItem[];
}
```

e `src/components/forms/form-dashboard.tsx` com:

```tsx
export interface FormDashboardProps {
  data: FormResults;
}
```

O painel lista os formulários e traz "Criar formulário", que chama `createForm` e navega
para `/setores/rh/formularios/{id}`. e renderizá-lo dentro de `EvaluationResultsPanel`, atrás de `can("forms.manage")`. Buscar `getFormsForViewer()` em `src/app/setores/rh/page.tsx` e passar por `HrSectorView`.

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tudo limpo.

- [ ] **Step 6: Commit**

```bash
git add src/components/hr/forms-panel.tsx src/components/forms/form-dashboard.tsx src/components/forms/answer-bars.tsx src/lib/forms/data.ts src/app/setores/rh/page.tsx src/components/hr/hr-sector-view.tsx src/components/hr/evaluation-results-panel.tsx
git commit -m "Formulários: bloco no DHO e dashboard de resultados

Uma cor só nos gráficos, accent. Nunca primary — reprova contraste no tema
claro (2,97:1, abaixo do mínimo de 3:1) e é a cor de ação, então barra verde
num painel lê como coisa clicável. E nunca cor por opção: o validador reprova
o par accent/info em deuteranopia, e a cor não codificaria nada de qualquer
modo, já que o rótulo está ao lado da barra.

Cada pergunta ganha a forma do trabalho do dado: barras horizontais para
opções, verticais na ordem 1→N para escala (a ordem carrega significado), e
lista para texto, que não é gráfico.

Formulário anônimo esconde o agregado abaixo de 5 respostas, com o motivo
escrito na tela. 'Quem falta responder' continua funcionando: sai da
atribuição, não da resposta."
```

---

## Verificação final

- [ ] `npm run typecheck` limpo
- [ ] `npm run lint` limpo
- [ ] `npm test` — 18 (existentes) + 15 (rules) + 12 (validation) + 5 (aggregate) = **50 testes**
- [ ] `npm run build` limpo
- [ ] Migration **não aplicada** aqui (sem banco). O entrypoint roda `prisma migrate deploy` no deploy.

### Roteiro manual, após o deploy

1. ADMIN cria formulário, adiciona uma pergunta de cada tipo, salva e publica para um setor.
2. Colaborador do setor vê a pendência em "Minhas Avaliações" e o **contador vermelho sobe**.
3. Responde; o contador **cai na hora** e a tarefa some.
4. Tentar responder de novo pela mesma URL → recusado.
5. ADMIN abre o dashboard: barras, média e lista de textos conferem com o que foi enviado.
6. Publicar anônimo, responder com 2 pessoas → agregado **suprimido**, mas "quem falta" listado.
7. GESTOR de outro setor **não vê** o formulário na listagem, e abrir a URL direta dá 404.
8. Editar formulário já respondido → estrutura travada, com o motivo na tela.
