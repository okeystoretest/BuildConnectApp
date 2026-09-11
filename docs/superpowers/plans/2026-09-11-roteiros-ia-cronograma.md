# Roteiros do Cronograma pela IA — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão "Roteiro" no modal de detalhes do card do Cronograma gera, pelo Gemini, um roteiro a partir dos campos do card e o guarda no próprio card; a Retaguarda ganha uma aba, só para Admin, com a chave da API, o modelo e as instruções do sistema (Padrão, OKEY, Lov Club).

**Architecture:** Tudo passa por Server Actions, como o resto do repositório — a chave do Gemini vive cifrada no banco (`AiSettings`), é decifrada só no servidor na hora da chamada, e nenhum tipo exportado a componente a contém. Quatro módulos puros em `src/lib/ai/` (cifra, prompt, chamada HTTP, leitura de configuração) são testados sem rede; as actions os orquestram. Os guardas de autoria do Cronograma saem de `cronograma-actions.ts` para `cronograma-guards.ts` para serem reusados sem virar endpoint.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 18, Prisma 6 + Postgres, Zod 3, `node:crypto` (AES-256-GCM), `fetch` nativo para a API REST do Gemini (`generativelanguage.googleapis.com/v1beta`), `node:test` via `tsx --test`, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-11-roteiros-ia-cronograma-design.md`

## Global Constraints

- Nenhuma dependência nova: o `package.json` não muda. A chamada ao Gemini é `fetch` puro.
- A chave da API **nunca** aparece em arquivo do repositório, em log, em URL ou em tipo exportado a componente. Vai no header `x-goog-api-key`.
- Corpo de erro do Google vai para `console.error` com prefixo `[gemini]`; a tela só vê as mensagens traduzidas da tabela da spec §3.3.
- Gerar roteiro exige `canEditPost` (autor ou Admin) e respeita `consume("ai-script:user:<id>", 20, 3_600_000)`.
- Falha do Gemini não toca o banco: roteiro anterior permanece.
- Tetos: instrução 8000 caracteres; roteiro editado à mão 12000; modelo 80; chave 200.
- Escopos de instrução: `"DEFAULT" | "OKEY" | "LOV_CLUB"`. Padrão sempre primeiro, marca depois; ambas vazias → `FALLBACK_INSTRUCTION`.
- Modelo padrão: `gemini-2.5-flash`. Timeout da chamada: 45 s. `maxOutputTokens: 2048`, `temperature: 0.7`.
- Todo texto de interface e todo comentário em português do Brasil, no tom dos arquivos vizinhos (comentários explicam o PORQUÊ).
- `tsconfig` tem `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` — o código do plano já respeita; não desligue nada.
- Commits direto no `main`, um por tarefa, mensagem em português no estilo do `git log`. Sem push até a verificação final (Task 12).
- Migration escrita à mão em `prisma/migrations/20260911120000_ai_scripts/migration.sql`; o `docker-entrypoint.sh` já roda `prisma migrate deploy` no deploy.

---

## Estrutura de arquivos

**Novos**

| Arquivo | Responsabilidade |
|---|---|
| `prisma/migrations/20260911120000_ai_scripts/migration.sql` | Tabelas `AiSettings`, `AiInstruction`; colunas de roteiro em `ContentPost`. |
| `src/lib/ai/scopes.ts` | Constantes puras compartilhadas por servidor e cliente: escopos, rótulos, modelo padrão, tetos. |
| `src/lib/ai/secret.ts` (+ `.test.ts`) | `encryptSecret` / `decryptSecret` — AES-256-GCM com chave derivada do `SESSION_SECRET`. |
| `src/lib/ai/script-prompt.ts` (+ `.test.ts`) | `buildScriptPrompt`, `composeSystemInstruction`, `FALLBACK_INSTRUCTION`. Puro. |
| `src/lib/ai/gemini.ts` (+ `.test.ts`) | `generateText` — a chamada HTTP e a tradução de erros. |
| `src/lib/ai/settings-data.ts` | Leitura para a tela (`getAiSettingsView`), `isAiReady`, `loadAiRuntime` (única função que decifra). |
| `src/lib/ai/settings-actions.ts` | Server Actions de Admin: salvar credenciais, remover chave, salvar instrução, testar conexão. |
| `src/lib/ai/script-actions.ts` | Server Actions do card: `generatePostScript`, `savePostScript`. |
| `src/lib/cronograma-guards.ts` | `requireUser`, `requireAuthor`, `requireScope`, `revalidateScope` extraídos de `cronograma-actions.ts`. |
| `src/components/it/ai-settings-panel.tsx` | A aba "Inteligência Artificial" da Retaguarda. |
| `src/components/cronograma/post-script.tsx` | A seção "Roteiro" do modal de detalhes (ler, gerar, regerar, editar). |

**Alterados**

| Arquivo | O que muda |
|---|---|
| `src/types/index.ts`, `src/lib/permissions.ts`, `src/lib/permissions.test.ts` | Permissão `ai.manage` (só ADMIN). |
| `prisma/schema.prisma` | Modelos e relações da spec §2. |
| `src/lib/cronograma-actions.ts` | Importa os guardas em vez de defini-los. |
| `src/types/cronograma.ts` | `ContentPostItem.script/scriptUpdatedAt/scriptAuthorName`; `CronogramaData.aiReady`. |
| `src/lib/cronograma-data.ts` | `select` e `toItem` carregam o roteiro; `getCronogramaData` devolve `aiReady`. |
| `src/app/setores/ti/page.tsx`, `src/components/it/it-sector-view.tsx` | Carrega e monta a aba de IA para Admin. |
| `src/components/cronograma/cronograma-panel.tsx`, `post-details-modal.tsx` | Passa `aiReady`; monta `PostScript` e o botão "Roteiro". |
| `.env.example` | Comentário: a chave do Gemini fica no banco, pela Retaguarda. |

---

### Task 1: Permissão `ai.manage`

**Files:**
- Modify: `src/types/index.ts:34-37` (fim da union `Permission`)
- Modify: `src/lib/permissions.ts:28-46` (linha `ADMIN`)
- Test: `src/lib/permissions.test.ts`

**Interfaces:**
- Produces: o literal `"ai.manage"` no tipo `Permission`; `can(role, "ai.manage")` verdadeiro só para `ADMIN`. Tasks 6, 10 e 11 usam.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao fim de `src/lib/permissions.test.ts`:

```ts
test("ai.manage é exclusiva do ADMIN — a chave da API do Gemini fica com a administração", () => {
  assert.equal(can("ADMIN", "ai.manage"), true);
  assert.equal(can("GESTOR", "ai.manage"), false);
  assert.equal(can("COLABORADOR", "ai.manage"), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/permissions.test.ts`
Expected: o teste novo falha na compilação de tipo ou em runtime — `"ai.manage"` não existe em `Permission`, `can` devolve `false` para ADMIN.

- [ ] **Step 3: Adicionar o literal ao tipo**

Em `src/types/index.ts`, troque o fim da union:

```ts
  // Criar, publicar e ler os resultados dos formulários do DHO. GESTOR e ADMIN.
  // O recorte por setor NÃO mora aqui: a matriz é por papel, e quem recorta é
  // a cláusula de consulta (ver formScopeFor em lib/forms/rules).
  | "forms.manage"
  // Configurar a integração com o Gemini: chave da API, modelo e instruções
  // do sistema, na aba "Inteligência Artificial" da Retaguarda. Só ADMIN —
  // é a tela onde uma credencial paga é colada.
  | "ai.manage";
```

- [ ] **Step 4: Adicionar à matriz**

Em `src/lib/permissions.ts`, na lista `ADMIN`, depois de `"users.manage",`:

```ts
    "users.manage",
    "ai.manage",
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx tsx --test src/lib/permissions.test.ts`
Expected: todos os testes do arquivo passam (3 testes).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/permissions.ts src/lib/permissions.test.ts
git commit -m "Permissão ai.manage: configurar a IA é coisa da administração"
```

---

### Task 2: Schema Prisma e migration

**Files:**
- Modify: `prisma/schema.prisma` (modelo `User` ~linha 84-108, modelo `ContentPost` linha 420-462, novos modelos após `PlatformWelcomeVideo` ~linha 218)
- Create: `prisma/migrations/20260911120000_ai_scripts/migration.sql`

**Interfaces:**
- Produces: `prisma.aiSettings`, `prisma.aiInstruction`, e `contentPost.script / scriptUpdatedAt / scriptById / scriptBy`. Tasks 6, 8 e 9 usam.

- [ ] **Step 1: Modelos novos no schema**

Em `prisma/schema.prisma`, logo após o modelo `PlatformWelcomeVideo` (antes do comentário de `RateLimit`), insira:

```prisma
/**
 * Integração com o Gemini — credencial e modelo. Linha única, como
 * PlatformWelcomeVideo.
 *
 * A chave fica CIFRADA (AES-256-GCM, chave derivada do SESSION_SECRET — ver
 * lib/ai/secret.ts): um dump do banco não entrega a chave da API. `apiKeyHint`
 * guarda só os 4 últimos caracteres, em claro, para a tela dizer QUAL chave
 * está salva sem nunca devolver a chave inteira ao navegador.
 */
model AiSettings {
  id           String   @id @default("singleton")
  apiKeyCipher String?
  apiKeyHint   String?
  model        String   @default("gemini-2.5-flash")
  updatedAt    DateTime @updatedAt
  updatedById  String?
  updatedBy    User?    @relation("AiSettingsEditor", fields: [updatedById], references: [id], onDelete: SetNull)
}

/**
 * Instruções do sistema (system instructions) da IA, por escopo.
 * id: "DEFAULT" | "OKEY" | "LOV_CLUB". A Padrão vale para todo roteiro; a da
 * marca é acrescentada depois dela quando o card tem marca.
 *
 * Chave de texto, e não colunas fixas em AiSettings, porque marca nova vira
 * INSERT — não vira migration.
 */
model AiInstruction {
  id          String   @id
  body        String
  updatedAt   DateTime @updatedAt
  updatedById String?
  updatedBy   User?    @relation("AiInstructionEditor", fields: [updatedById], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 2: Colunas de roteiro em `ContentPost`**

No modelo `ContentPost`, logo depois do bloco `createdById`/`createdBy` e antes de `createdAt`:

```prisma
  // Roteiro da atividade: rascunho da IA, acabamento da pessoa. Nulo = nunca
  // gerado. Os três andam juntos — o texto, quem o escreveu por último e
  // quando — para o modal dizer "Gerado por X · data".
  script          String?
  scriptUpdatedAt DateTime?
  scriptById      String?
  scriptBy        User?     @relation("ContentPostScript", fields: [scriptById], references: [id], onDelete: SetNull)
```

E na lista de índices do mesmo modelo, após `@@index([createdById])`:

```prisma
  @@index([scriptById])
```

- [ ] **Step 3: Relações inversas em `User`**

No modelo `User`, logo após `authoredPosts      ContentPost[]      @relation("ContentPostAuthor")`:

```prisma
  // Roteiros de card que este usuário gerou ou editou por último.
  contentScripts     ContentPost[]      @relation("ContentPostScript")
  // Configuração da IA (Retaguarda) — quem salvou por último.
  aiSettingsEdits    AiSettings[]       @relation("AiSettingsEditor")
  aiInstructionEdits AiInstruction[]    @relation("AiInstructionEditor")
```

- [ ] **Step 4: Validar o schema e gerar o client**

Run: `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` e `Generated Prisma Client`.

- [ ] **Step 5: Escrever a migration à mão**

Crie `prisma/migrations/20260911120000_ai_scripts/migration.sql`:

```sql
-- Roteiros do Cronograma pela IA.
--
-- Duas tabelas novas e três colunas em ContentPost. Nada aqui reescreve linha
-- existente: todo card continua válido com roteiro nulo, e a plataforma sem
-- linha em AiSettings é a plataforma "sem IA" — o botão nem aparece.
--
-- AiSettings guarda a chave CIFRADA (ver lib/ai/secret.ts); apiKeyHint são só
-- os 4 últimos caracteres, para a tela confirmar qual chave está salva.

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "apiKeyCipher" TEXT,
    "apiKeyHint" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInstruction" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AiInstruction_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ContentPost"
    ADD COLUMN "script" TEXT,
    ADD COLUMN "scriptUpdatedAt" TIMESTAMP(3),
    ADD COLUMN "scriptById" TEXT;

-- CreateIndex
CREATE INDEX "ContentPost_scriptById_idx" ON "ContentPost"("scriptById");

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInstruction" ADD CONSTRAINT "AiInstruction_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_scriptById_fkey"
    FOREIGN KEY ("scriptById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 6: Conferir que a migration bate com o schema**

Run: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$DATABASE_URL"`

Expected: `No difference detected.` Se o `DATABASE_URL` do `.env` local não estiver acessível, o comando falha por conexão — nesse caso, rode `npx prisma migrate deploy` quando houver banco; o `docker-entrypoint.sh` aplica no deploy.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (nada usa os campos novos ainda).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260911120000_ai_scripts/migration.sql
git commit -m "Banco: AiSettings, AiInstruction e o roteiro no ContentPost"
```

---

### Task 3: Cifra da chave — `secret.ts`

**Files:**
- Create: `src/lib/ai/secret.ts`
- Test: `src/lib/ai/secret.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plain: string): string` e `decryptSecret(cipher: string): string` (lança `Error` em cifra adulterada/formato desconhecido). Task 6 usa.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/lib/ai/secret.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

// A chave de cifra deriva do SESSION_SECRET. O módulo lê a variável na
// primeira chamada, então ela precisa existir ANTES do import dinâmico.
process.env.SESSION_SECRET = "segredo-de-teste-com-bem-mais-de-dezesseis-caracteres";

const { encryptSecret, decryptSecret } = await import("./secret");

test("ida e volta devolve o texto original", () => {
  const plain = "AQ.chave-de-exemplo-1234";
  assert.equal(decryptSecret(encryptSecret(plain)), plain);
});

test("cifrar duas vezes o mesmo texto produz cifras diferentes (IV aleatório)", () => {
  const plain = "mesma-chave";
  assert.notEqual(encryptSecret(plain), encryptSecret(plain));
});

test("cifra adulterada lança em vez de devolver lixo", () => {
  const cipher = encryptSecret("texto-integro");
  const [version, iv, tag, data] = cipher.split(":");
  // Troca um caractere no meio dos dados: o GCM detecta e recusa.
  const middle = Math.floor((data ?? "").length / 2);
  const swapped = data?.[middle] === "A" ? "B" : "A";
  const tampered = `${version}:${iv}:${tag}:${data?.slice(0, middle)}${swapped}${data?.slice(middle + 1)}`;
  assert.throws(() => decryptSecret(tampered));
});

test("formato desconhecido lança", () => {
  assert.throws(() => decryptSecret("v9:abc:def:ghi"), /formato/);
  assert.throws(() => decryptSecret("sem-separador"), /formato/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/ai/secret.test.ts`
Expected: falha — `Cannot find module './secret'`.

- [ ] **Step 3: Implementar**

Crie `src/lib/ai/secret.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Cifra da chave da API do Gemini em repouso.
 *
 * AES-256-GCM: autenticado, então uma cifra adulterada (ou cifrada com outro
 * segredo) falha em vez de virar lixo silencioso. A chave de cifra deriva do
 * SESSION_SECRET — que já é obrigatório e validado em lib/auth/session.ts —
 * para não entrar mais uma variável de ambiente que alguém tem de gerar.
 *
 * Consequência aceita: trocar o SESSION_SECRET invalida a cifra. A tela
 * continua dizendo "chave salva", mas gerar falha com "chave ilegível" e a
 * saída é colar a chave de novo na Retaguarda.
 *
 * Formato gravado: "v1:<iv>:<tag>:<dados>", tudo em base64url. A versão na
 * frente é o que permite trocar o algoritmo um dia sem quebrar o que já está
 * no banco.
 */

const VERSION = "v1";
const SALT = "buildconnect:ai-settings";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET ausente ou curto demais.");
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    data.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, data] = value.split(":");
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error("Cifra em formato desconhecido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/ai/secret.test.ts`
Expected: 4 testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/secret.ts src/lib/ai/secret.test.ts
git commit -m "IA: a chave da API é cifrada com AES-GCM antes de tocar o banco"
```

---

### Task 4: Prompt e instruções — `scopes.ts` e `script-prompt.ts`

**Files:**
- Create: `src/lib/ai/scopes.ts`
- Create: `src/lib/ai/script-prompt.ts`
- Test: `src/lib/ai/script-prompt.test.ts`

**Interfaces:**
- Produces (`scopes.ts`): `AI_SCOPES`, `type AiScope`, `AI_SCOPE_LABEL`, `AI_SCOPE_HINT`, `DEFAULT_MODEL`, `INSTRUCTION_MAX = 8000`, `SCRIPT_MAX = 12000`, `MODEL_MAX = 80`, `API_KEY_MAX = 200`. Tasks 6, 8, 10 e 11 usam. É puro (sem prisma) para o cliente poder importar.
- Produces (`script-prompt.ts`): `interface ScriptSubject`, `buildScriptPrompt(subject): string`, `composeSystemInstruction(defaultBody, brandBody): string`, `FALLBACK_INSTRUCTION`. Task 8 usa.

- [ ] **Step 1: Criar `scopes.ts`**

```ts
import { BRAND } from "@/lib/funnel";

/**
 * Vocabulário da configuração de IA, compartilhado por servidor e cliente.
 * Sem importar prisma de propósito: o painel da Retaguarda (client component)
 * lê daqui os rótulos e os tetos.
 */

export const AI_SCOPES = ["DEFAULT", "OKEY", "LOV_CLUB"] as const;
export type AiScope = (typeof AI_SCOPES)[number];

export const AI_SCOPE_LABEL: Record<AiScope, string> = {
  DEFAULT: "Padrão",
  OKEY: BRAND.OKEY.label,
  LOV_CLUB: BRAND.LOV_CLUB.label,
};

export const AI_SCOPE_HINT: Record<AiScope, string> = {
  DEFAULT:
    "Vale para todo roteiro, de qualquer marca. É o lugar das regras da empresa: o que nunca pode aparecer, idioma, tamanho, estrutura.",
  OKEY: "Acrescentada depois da Padrão quando o card é da OKEY. Tom, vocabulário e assinatura da marca.",
  LOV_CLUB: "Acrescentada depois da Padrão quando o card é da Lov Club. Tom, vocabulário e assinatura da marca.",
};

export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Tetos de tamanho, em caracteres. Os mesmos no formulário e na action. */
export const INSTRUCTION_MAX = 8000;
export const SCRIPT_MAX = 12000;
export const MODEL_MAX = 80;
export const API_KEY_MAX = 200;
```

- [ ] **Step 2: Escrever os testes que falham**

Crie `src/lib/ai/script-prompt.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScriptPrompt,
  composeSystemInstruction,
  FALLBACK_INSTRUCTION,
  type ScriptSubject,
} from "./script-prompt";

const minimo: ScriptSubject = {
  title: "Reel de lançamento",
  date: "2026-09-15",
  time: "10:00",
  funnel: "TOFU",
  formats: ["REEL"],
  status: "IDEIA",
  platforms: [],
};

test("card mínimo: só as linhas obrigatórias, sem 'não informado'", () => {
  const prompt = buildScriptPrompt(minimo);
  assert.match(prompt, /Título: Reel de lançamento/);
  assert.match(prompt, /Data e horário: 15\/09\/2026 às 10:00/);
  assert.match(prompt, /Etapa do funil: TOFU · Atração/);
  assert.match(prompt, /Formatos: Reel/);
  assert.match(prompt, /Status: Ideia/);
  assert.doesNotMatch(prompt, /Marca:/);
  assert.doesNotMatch(prompt, /Redes:/);
  assert.doesNotMatch(prompt, /Observações:/);
  assert.doesNotMatch(prompt, /Responsável:/);
  assert.doesNotMatch(prompt, /não informad/i);
});

test("card completo: marca, redes, responsável e observações entram", () => {
  const prompt = buildScriptPrompt({
    ...minimo,
    brand: "LOV_CLUB",
    platforms: ["INSTAGRAM", "TIKTOK"],
    ownerName: "Ana Souza",
    notes: "Gravar na loja.\nMostrar a vitrine.",
  });
  assert.match(prompt, /Marca: Lov Club/);
  assert.match(prompt, /Redes: Instagram, TikTok/);
  assert.match(prompt, /Responsável: Ana Souza/);
  assert.match(prompt, /Observações:\nGravar na loja\.\nMostrar a vitrine\./);
});

test("formato OUTRO usa o texto livre, não a palavra 'Outro'", () => {
  const prompt = buildScriptPrompt({
    ...minimo,
    formats: ["STORY", "OUTRO"],
    formatOther: "Bastidores",
  });
  assert.match(prompt, /Formatos: Story, Bastidores/);
  assert.doesNotMatch(prompt, /Outro/);
});

test("observação só de espaços não vira linha", () => {
  const prompt = buildScriptPrompt({ ...minimo, notes: "   \n  " });
  assert.doesNotMatch(prompt, /Observações:/);
});

test("composição: Padrão vem antes da marca, separadas por linha em branco", () => {
  assert.equal(composeSystemInstruction("Regras gerais.", "Tom da marca."), "Regras gerais.\n\nTom da marca.");
});

test("composição: só Padrão, só marca, e nenhuma → fallback", () => {
  assert.equal(composeSystemInstruction("Regras gerais.", null), "Regras gerais.");
  assert.equal(composeSystemInstruction(null, "Tom da marca."), "Tom da marca.");
  assert.equal(composeSystemInstruction(null, null), FALLBACK_INSTRUCTION);
  assert.equal(composeSystemInstruction("  ", ""), FALLBACK_INSTRUCTION);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx tsx --test src/lib/ai/script-prompt.test.ts`
Expected: falha — `Cannot find module './script-prompt'`.

- [ ] **Step 4: Implementar `script-prompt.ts`**

```ts
import { BRAND, FUNNEL, PLATFORM, STATUS_LABEL, formatLabel, resolveFormats } from "@/lib/funnel";
import type {
  ContentBrand,
  ContentFormat,
  ContentPlatform,
  ContentStatus,
  FunnelStage,
} from "@/types/cronograma";

/**
 * O que o Gemini recebe para escrever um roteiro.
 *
 * Duas partes, e a separação importa:
 *  - a INSTRUÇÃO DO SISTEMA é o comportamento — escrita pela administração na
 *    Retaguarda (Padrão + marca), e é dela que vem tom, idioma, estrutura;
 *  - o PROMPT é o card — os campos do formulário, uma linha por campo, nos
 *    mesmos rótulos que a tela mostra (lib/funnel), para a pessoa reconhecer
 *    no roteiro o que preencheu.
 *
 * Campo vazio não vira linha. "Marca: não informada" só ensinaria o modelo a
 * comentar a ausência.
 */

export interface ScriptSubject {
  title: string;
  /** yyyy-mm-dd, como em ContentPostItem. */
  date: string;
  /** hh:mm. */
  time: string;
  funnel: FunnelStage;
  formats: readonly ContentFormat[];
  formatOther?: string;
  status: ContentStatus;
  brand?: ContentBrand;
  platforms: readonly ContentPlatform[];
  notes?: string;
  ownerName?: string;
}

/**
 * Usada quando NENHUMA instrução foi escrita na Retaguarda — para a
 * funcionalidade funcionar no dia em que a chave for colada.
 */
export const FALLBACK_INSTRUCTION =
  "Você é roteirista de conteúdo para redes sociais. Escreva em português do Brasil. Responda apenas com o roteiro.";

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function buildScriptPrompt(subject: ScriptSubject): string {
  const lines: string[] = [
    `Título: ${subject.title}`,
    `Data e horário: ${formatDate(subject.date)} às ${subject.time}`,
    `Etapa do funil: ${FUNNEL[subject.funnel].label}`,
  ];

  const formats = resolveFormats(subject.formats);
  if (formats.length > 0) {
    lines.push(`Formatos: ${formats.map((f) => formatLabel(f, subject.formatOther)).join(", ")}`);
  }
  if (subject.platforms.length > 0) {
    lines.push(`Redes: ${subject.platforms.map((p) => PLATFORM[p].label).join(", ")}`);
  }
  if (subject.brand) lines.push(`Marca: ${BRAND[subject.brand].label}`);
  lines.push(`Status: ${STATUS_LABEL[subject.status]}`);
  if (subject.ownerName) lines.push(`Responsável: ${subject.ownerName}`);

  const notes = subject.notes?.trim();
  if (notes) lines.push(`Observações:\n${notes}`);

  return `Crie o roteiro para a atividade abaixo do cronograma de conteúdo.\n\n${lines.join("\n")}`;
}

/**
 * Padrão sempre primeiro (as regras da casa), marca depois (o tom). Quem
 * escreve a instrução da marca não precisa repetir as regras gerais.
 */
export function composeSystemInstruction(
  defaultBody: string | null | undefined,
  brandBody: string | null | undefined,
): string {
  const parts = [defaultBody?.trim(), brandBody?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join("\n\n") : FALLBACK_INSTRUCTION;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx tsx --test src/lib/ai/script-prompt.test.ts`
Expected: 6 testes passam. Se o `tsx` não resolver `@/lib/funnel`, troque os dois imports de `script-prompt.ts` e o de `scopes.ts` por relativos (`../funnel`, `../../types/cronograma`) — o `tsconfig` tem `paths` e o `tsx` 4 os lê, mas confira.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/scopes.ts src/lib/ai/script-prompt.ts src/lib/ai/script-prompt.test.ts
git commit -m "IA: o prompt é o card, uma linha por campo, e a instrução é Padrão + marca"
```

---

### Task 5: A chamada ao Gemini — `gemini.ts`

**Files:**
- Create: `src/lib/ai/gemini.ts`
- Test: `src/lib/ai/gemini.test.ts`

**Interfaces:**
- Produces: `interface GeminiRequest { apiKey; model; systemInstruction; prompt }`, `type GeminiResult = { ok: true; text: string } | { ok: false; error: string }`, `generateText(req, fetchImpl?): Promise<GeminiResult>`, `describeGeminiStatus(status, model): string`. Tasks 6 e 8 usam.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/lib/ai/gemini.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { describeGeminiStatus, generateText, type GeminiRequest } from "./gemini";

const req: GeminiRequest = {
  apiKey: "chave-secreta",
  model: "gemini-2.5-flash",
  systemInstruction: "Seja breve.",
  prompt: "Título: teste",
};

/** fetch falso: devolve o status e o corpo pedidos, e guarda o que recebeu. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

test("sucesso: concatena as partes do primeiro candidato", async () => {
  const { impl } = fakeFetch(200, {
    candidates: [{ content: { parts: [{ text: "Cena 1. " }, { text: "Cena 2." }] } }],
  });
  const result = await generateText(req, impl);
  assert.deepEqual(result, { ok: true, text: "Cena 1. Cena 2." });
});

test("a chave vai no header, nunca na URL; o modelo vai na URL", async () => {
  const { impl, calls } = fakeFetch(200, {
    candidates: [{ content: { parts: [{ text: "ok" }] } }],
  });
  await generateText(req, impl);
  const call = calls[0];
  assert.ok(call);
  assert.doesNotMatch(call.url, /chave-secreta/);
  assert.match(call.url, /\/models\/gemini-2\.5-flash:generateContent$/);
  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], "chave-secreta");
  const body = JSON.parse(String(call.init?.body)) as {
    systemInstruction: { parts: Array<{ text: string }> };
    contents: Array<{ parts: Array<{ text: string }> }>;
  };
  assert.equal(body.systemInstruction.parts[0]?.text, "Seja breve.");
  assert.equal(body.contents[0]?.parts[0]?.text, "Título: teste");
});

test("resposta vazia, bloqueio ou SAFETY viram recusa", async () => {
  for (const body of [
    { candidates: [] },
    { candidates: [{ content: { parts: [{ text: "   " }] } }] },
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "x" }] } }] },
  ]) {
    const { impl } = fakeFetch(200, body);
    const result = await generateText(req, impl);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /recusou/);
  }
});

test("status HTTP é traduzido, sem vazar o corpo do Google", async () => {
  const cases: Array<[number, RegExp]> = [
    [400, /Chave da API inválida/],
    [401, /Chave da API inválida/],
    [403, /Chave da API inválida/],
    [404, /modelo "gemini-2\.5-flash" não existe/],
    [429, /Cota do Gemini esgotada/],
    [500, /não respondeu/],
    [503, /não respondeu/],
  ];
  for (const [status, pattern] of cases) {
    const { impl } = fakeFetch(status, { error: { message: "SEGREDO-DO-GOOGLE" } });
    const result = await generateText(req, impl);
    assert.equal(result.ok, false, `status ${status}`);
    if (!result.ok) {
      assert.match(result.error, pattern, `status ${status}`);
      assert.doesNotMatch(result.error, /SEGREDO-DO-GOOGLE/);
    }
  }
});

test("falha de rede vira 'não respondeu'", async () => {
  const impl = (async () => {
    throw new Error("ECONNRESET");
  }) as typeof fetch;
  const result = await generateText(req, impl);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /não respondeu/);
});

test("describeGeminiStatus cobre o desconhecido como 'não respondeu'", () => {
  assert.match(describeGeminiStatus(0, "m"), /não respondeu/);
  assert.match(describeGeminiStatus(418, "m"), /não respondeu/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/ai/gemini.test.ts`
Expected: falha — `Cannot find module './gemini'`.

- [ ] **Step 3: Implementar `gemini.ts`**

```ts
/**
 * A chamada ao Gemini — e só ela.
 *
 * `fetch` puro contra a API REST (sem SDK: o package.json não muda e o que
 * sai daqui é exatamente o que está escrito aqui). A chave vai no header
 * `x-goog-api-key`, nunca na URL — URL cai em log de proxy, header não.
 *
 * Tudo que o Google devolve de erro fica no `console.error` do servidor. A
 * tela recebe uma das frases de `describeGeminiStatus`, em português, que
 * dizem à pessoa o que fazer (trocar a chave, conferir o modelo, esperar) sem
 * repassar o corpo cru — que às vezes ecoa a própria requisição.
 */

export interface GeminiRequest {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
}

export type GeminiResult = { ok: true; text: string } | { ok: false; error: string };

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 45_000;

const REFUSED =
  "O Gemini recusou gerar este roteiro. Ajuste as observações do card ou as instruções na Retaguarda.";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

/** Mensagem para a tela a partir do status HTTP. 0 = rede/timeout. */
export function describeGeminiStatus(status: number, model: string): string {
  if (status === 400 || status === 401 || status === 403) {
    return "Chave da API inválida ou sem acesso ao modelo. Confira a chave na Retaguarda.";
  }
  if (status === 404) return `O modelo "${model}" não existe. Confira o nome na Retaguarda.`;
  if (status === 429) return "Cota do Gemini esgotada. Tente novamente em alguns minutos.";
  return "O Gemini não respondeu. Tente novamente.";
}

export async function generateText(
  req: GeminiRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GeminiResult> {
  const url = `${BASE_URL}/${encodeURIComponent(req.model)}:generateContent`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": req.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error("[gemini] rede/timeout:", e);
    return { ok: false, error: describeGeminiStatus(0, req.model) };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[gemini] HTTP ${response.status}:`, detail.slice(0, 2000));
    return { ok: false, error: describeGeminiStatus(response.status, req.model) };
  }

  let body: GeminiResponse;
  try {
    body = (await response.json()) as GeminiResponse;
  } catch (e) {
    console.error("[gemini] corpo ilegível:", e);
    return { ok: false, error: describeGeminiStatus(0, req.model) };
  }

  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text || body.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY") {
    console.error("[gemini] recusa:", body.promptFeedback?.blockReason ?? candidate?.finishReason ?? "vazio");
    return { ok: false, error: REFUSED };
  }

  return { ok: true, text };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/ai/gemini.test.ts`
Expected: 6 testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/gemini.ts src/lib/ai/gemini.test.ts
git commit -m "IA: a chamada ao Gemini em fetch puro, com erro traduzido e chave no header"
```

---

### Task 6: Leitura e Server Actions da configuração

**Files:**
- Create: `src/lib/ai/settings-data.ts`
- Create: `src/lib/ai/settings-actions.ts`

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` (Task 3), `generateText` (Task 5), `AI_SCOPES`, `AiScope`, `DEFAULT_MODEL`, tetos (Task 4), `can(role, "ai.manage")` (Task 1), `consume` de `@/lib/rate-limit`.
- Produces (`settings-data.ts`): `AI_SETTINGS_ID = "singleton"`, `interface AiInstructionView { body; updatedAt: string | null; updatedByName: string | null }`, `interface AiSettingsView { hasKey; keyHint; model; instructions: Record<AiScope, AiInstructionView> }`, `getAiSettingsView()`, `isAiReady(): Promise<boolean>`, `type AiRuntime`, `loadAiRuntime(): Promise<AiRuntime>`, `AI_RATE_KEY(userId)`, `AI_RATE_LIMIT = 20`, `AI_RATE_WINDOW_MS`. Tasks 8, 9, 10 usam.
- Produces (`settings-actions.ts`): `saveAiCredentials({ apiKey?, model })`, `removeAiKey()`, `saveAiInstruction({ scope, body })`, `testAiConnection()` → `AiActionResult` (`{ ok; error?; model? }`). Task 10 usa.

- [ ] **Step 1: Criar `settings-data.ts`**

```ts
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "./secret";
import { AI_SCOPES, DEFAULT_MODEL, type AiScope } from "./scopes";

/**
 * Leitura da configuração de IA.
 *
 * Duas leituras com fronteira clara:
 *  - `getAiSettingsView` é o que a TELA recebe. Não existe caminho de código
 *    aqui que devolva `apiKeyCipher` ou a chave em claro — só `hasKey` e os
 *    4 últimos caracteres;
 *  - `loadAiRuntime` é a ÚNICA função que decifra a chave, e só as actions
 *    que chamam o Gemini a usam. O resultado nunca é serializado ao cliente.
 */

export const AI_SETTINGS_ID = "singleton";

/** Chave do rate limit de geração: por pessoa, 20 por hora. */
export const AI_RATE_LIMIT = 20;
export const AI_RATE_WINDOW_MS = 60 * 60 * 1000;
export function aiRateKey(userId: string): string {
  return `ai-script:user:${userId}`;
}

export interface AiInstructionView {
  body: string;
  /** ISO. Nulo quando o escopo nunca foi salvo. */
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface AiSettingsView {
  hasKey: boolean;
  /** Últimos 4 caracteres da chave salva, ou null. */
  keyHint: string | null;
  model: string;
  instructions: Record<AiScope, AiInstructionView>;
}

export async function getAiSettingsView(): Promise<AiSettingsView> {
  const [settings, rows] = await Promise.all([
    prisma.aiSettings.findUnique({
      where: { id: AI_SETTINGS_ID },
      select: { apiKeyHint: true, apiKeyCipher: true, model: true },
    }),
    prisma.aiInstruction.findMany({
      select: {
        id: true,
        body: true,
        updatedAt: true,
        updatedBy: { select: { fullName: true } },
      },
    }),
  ]);

  const empty: AiInstructionView = { body: "", updatedAt: null, updatedByName: null };
  const instructions = Object.fromEntries(
    AI_SCOPES.map((scope) => [scope, { ...empty }]),
  ) as Record<AiScope, AiInstructionView>;

  for (const row of rows) {
    if ((AI_SCOPES as readonly string[]).includes(row.id)) {
      instructions[row.id as AiScope] = {
        body: row.body,
        updatedAt: row.updatedAt.toISOString(),
        updatedByName: row.updatedBy?.fullName ?? null,
      };
    }
  }

  return {
    // `hasKey` deriva da cifra, não do hint: é a cifra que a geração usa.
    hasKey: Boolean(settings?.apiKeyCipher),
    keyHint: settings?.apiKeyCipher ? (settings.apiKeyHint ?? null) : null,
    model: settings?.model ?? DEFAULT_MODEL,
    instructions,
  };
}

/** Há chave salva? É o que liga o botão "Roteiro" no Cronograma. */
export async function isAiReady(): Promise<boolean> {
  const row = await prisma.aiSettings.findUnique({
    where: { id: AI_SETTINGS_ID },
    select: { apiKeyCipher: true },
  });
  return Boolean(row?.apiKeyCipher);
}

export type AiRuntime =
  | {
      ok: true;
      apiKey: string;
      model: string;
      instructions: Partial<Record<AiScope, string>>;
    }
  | { ok: false; error: string };

/**
 * Chave decifrada + modelo + instruções, para chamar o Gemini. Só o servidor
 * vê o retorno. Cifra ilegível (SESSION_SECRET trocado) vira erro com a
 * saída — recolar a chave.
 */
export async function loadAiRuntime(): Promise<AiRuntime> {
  const [settings, rows] = await Promise.all([
    prisma.aiSettings.findUnique({
      where: { id: AI_SETTINGS_ID },
      select: { apiKeyCipher: true, model: true },
    }),
    prisma.aiInstruction.findMany({ select: { id: true, body: true } }),
  ]);

  if (!settings?.apiKeyCipher) {
    return { ok: false, error: "A IA não está configurada. Peça à Retaguarda para salvar a chave da API." };
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(settings.apiKeyCipher);
  } catch (e) {
    console.error("[ai] chave ilegível:", e);
    return {
      ok: false,
      error: "Chave da API ilegível — salve-a de novo na aba Inteligência Artificial da Retaguarda.",
    };
  }

  const instructions: Partial<Record<AiScope, string>> = {};
  for (const row of rows) {
    if ((AI_SCOPES as readonly string[]).includes(row.id)) {
      instructions[row.id as AiScope] = row.body;
    }
  }

  return { ok: true, apiKey, model: settings.model || DEFAULT_MODEL, instructions };
}
```

- [ ] **Step 2: Criar `settings-actions.ts`**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { consume } from "@/lib/rate-limit";
import { encryptSecret } from "./secret";
import { generateText } from "./gemini";
import {
  AI_SETTINGS_ID,
  AI_RATE_LIMIT,
  AI_RATE_WINDOW_MS,
  aiRateKey,
  loadAiRuntime,
} from "./settings-data";
import { AI_SCOPES, API_KEY_MAX, INSTRUCTION_MAX, MODEL_MAX } from "./scopes";
import type { Role } from "@/types";

/**
 * Configuração da IA — as escritas da aba "Inteligência Artificial".
 *
 * Todas exigem `ai.manage` (hoje só o Admin): é a tela onde uma credencial
 * paga é colada. A chave entra por aqui, é cifrada ANTES de tocar o banco e
 * nunca é devolvida — nem por estas actions, nem por `getAiSettingsView`.
 */

export interface AiActionResult {
  ok: boolean;
  error?: string;
  /** Preenchido por `testAiConnection` no sucesso. */
  model?: string;
}

async function requireAiManager() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if (!can(user.role as Role, "ai.manage")) {
    return { user: null, error: "Apenas a administração configura a IA." };
  }
  return { user, error: null };
}

const credentialsSchema = z.object({
  // Vazio ou ausente = manter a chave atual. Apagar é `removeAiKey`.
  apiKey: z.string().trim().max(API_KEY_MAX, "Chave longa demais.").optional(),
  model: z
    .string()
    .trim()
    .min(1, "Informe o modelo.")
    .max(MODEL_MAX, "Nome do modelo longo demais.")
    .regex(/^[a-z0-9][a-z0-9.\-]*$/i, "Nome do modelo inválido. Ex.: gemini-2.5-flash"),
});

export async function saveAiCredentials(input: {
  apiKey?: string;
  model: string;
}): Promise<AiActionResult> {
  const { user, error } = await requireAiManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { apiKey, model } = parsed.data;

  // Só entra na escrita o que mudou: sem chave nova, a cifra atual fica.
  const keyFields = apiKey
    ? { apiKeyCipher: encryptSecret(apiKey), apiKeyHint: apiKey.slice(-4) }
    : {};

  try {
    await prisma.aiSettings.upsert({
      where: { id: AI_SETTINGS_ID },
      update: { model, updatedById: user.id, ...keyFields },
      create: { id: AI_SETTINGS_ID, model, updatedById: user.id, ...keyFields },
    });
  } catch (e) {
    console.error("[saveAiCredentials] db:", e);
    return { ok: false, error: "Falha ao salvar a configuração." };
  }

  revalidatePath("/setores/ti");
  return { ok: true };
}

/** Remove a chave. O botão "Roteiro" some do Cronograma; roteiros salvos ficam. */
export async function removeAiKey(): Promise<AiActionResult> {
  const { user, error } = await requireAiManager();
  if (!user) return { ok: false, error: error ?? undefined };

  try {
    await prisma.aiSettings.updateMany({
      where: { id: AI_SETTINGS_ID },
      data: { apiKeyCipher: null, apiKeyHint: null, updatedById: user.id },
    });
  } catch (e) {
    console.error("[removeAiKey] db:", e);
    return { ok: false, error: "Falha ao remover a chave." };
  }

  revalidatePath("/setores/ti");
  return { ok: true };
}

const instructionSchema = z.object({
  scope: z.enum(AI_SCOPES),
  body: z.string().max(INSTRUCTION_MAX, `A instrução tem no máximo ${INSTRUCTION_MAX} caracteres.`),
});

export async function saveAiInstruction(input: {
  scope: string;
  body: string;
}): Promise<AiActionResult> {
  const { user, error } = await requireAiManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = instructionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { scope } = parsed.data;
  const body = parsed.data.body.trim();

  try {
    if (body.length === 0) {
      // Instrução apagada = linha apagada. Sem linha, o escopo cai no fallback.
      await prisma.aiInstruction.deleteMany({ where: { id: scope } });
    } else {
      await prisma.aiInstruction.upsert({
        where: { id: scope },
        update: { body, updatedById: user.id },
        create: { id: scope, body, updatedById: user.id },
      });
    }
  } catch (e) {
    console.error("[saveAiInstruction] db:", e);
    return { ok: false, error: "Falha ao salvar a instrução." };
  }

  revalidatePath("/setores/ti");
  return { ok: true };
}

/**
 * Uma geração mínima para descobrir chave errada ou modelo inexistente AQUI,
 * e não na hora em que alguém precisa do roteiro. Conta no mesmo limite da
 * geração — é uma chamada paga como qualquer outra.
 */
export async function testAiConnection(): Promise<AiActionResult> {
  const { user, error } = await requireAiManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const runtime = await loadAiRuntime();
  if (!runtime.ok) return { ok: false, error: runtime.error };

  const limit = await consume(aiRateKey(user.id), AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
  if (!limit.ok) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return { ok: false, error: `Limite de chamadas por hora atingido. Tente em ${minutes} min.` };
  }

  const result = await generateText({
    apiKey: runtime.apiKey,
    model: runtime.model,
    systemInstruction: "Responda apenas com a palavra OK.",
    prompt: "Teste de conexão.",
  });
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true, model: runtime.model };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros. Se `z.enum(AI_SCOPES)` reclamar, troque por `z.enum(["DEFAULT", "OKEY", "LOV_CLUB"])`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/settings-data.ts src/lib/ai/settings-actions.ts
git commit -m "IA: leitura mascarada para a tela e actions de Admin para chave, modelo e instruções"
```

---

### Task 7: Extrair os guardas do Cronograma

**Files:**
- Create: `src/lib/cronograma-guards.ts`
- Modify: `src/lib/cronograma-actions.ts:1-12` (imports) e `:78-150` (remover as quatro funções)

**Interfaces:**
- Produces: `requireUser()`, `requireAuthor(postId, scopeId, user)`, `requireScope(slug, user)`, `revalidateScope(scopeId, currentSlug)` — assinaturas idênticas às atuais. Task 8 usa; `cronograma-actions.ts` passa a importar.

- [ ] **Step 1: Criar `cronograma-guards.ts` com o código movido**

```ts
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { resolveAppScope } from "@/lib/app-scope";
import { canEditPost } from "@/lib/cronograma-data";
import type { Role } from "@/types";

/**
 * Guardas das escritas do Cronograma.
 *
 * Moram num módulo SEM "use server" de propósito: exportá-los de
 * `cronograma-actions.ts` os transformaria em endpoints chamáveis pelo
 * navegador. Aqui são funções de servidor comuns, importadas pelas actions do
 * post (`cronograma-actions`) e do roteiro (`ai/script-actions`) — uma regra
 * de autoria só, nos dois lugares.
 */

/** Criar conteúdo é aberto: basta estar autenticado. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  return { user, error: null };
}

/**
 * Confere autoria antes de alterar. Retorna erro pronto para a UI quando o
 * usuário não é o autor — a checagem vive aqui, não no componente.
 */
export async function requireAuthor(
  postId: string,
  scopeId: string,
  user: { id: string; role: string },
) {
  const post = await prisma.contentPost.findFirst({
    where: { id: postId, subsectorId: scopeId },
    select: { createdById: true, visibility: true },
  });
  if (!post) return { post: null, error: "Post não encontrado." };
  if (!canEditPost(post.createdById, user.id, user.role as Role)) {
    return {
      post: null,
      error:
        post.visibility === "SHARED"
          ? "Atividade pública: apenas o autor pode alterá-la."
          : "Só o autor do conteúdo pode editá-lo.",
    };
  }
  return { post, error: null };
}

/**
 * Resolve o subsetor que guarda os dados, confirma que a ferramenta está ativa
 * e que o usuário tem acesso ao setor pedido.
 *
 * A checagem de acesso estava só nas páginas: pela action, qualquer usuário
 * autenticado escrevia no cronograma de um setor que nem enxerga no menu.
 */
export async function requireScope(slug: string, user: { id: string; role: string }) {
  const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
  if (!canAccessSlug(slugs, slug)) {
    return { scope: null, error: "Você não tem acesso a este setor." };
  }

  const scope = await resolveAppScope(slug);
  if (!scope) return { scope: null, error: "Setor não encontrado." };
  if (!scope.scheduleEnabled) {
    return { scope: null, error: "O Cronograma não está habilitado neste setor." };
  }
  return { scope, error: null };
}

/**
 * Revalida os OUTROS setores que compartilham a mesma base.
 *
 * O setor atual é deliberadamente excluído: revalidar a própria rota faz o
 * router do Next renavegar para ela, o que remonta a página e devolve o
 * usuário para a primeira aba. Quem atualiza a tela atual é o
 * `router.refresh()` do componente, que troca os dados sem remontar.
 */
export async function revalidateScope(scopeId: string, currentSlug: string) {
  const sharing = await prisma.subsector.findMany({
    where: { OR: [{ id: scopeId }, { appsSourceId: scopeId }] },
    select: { slug: true },
  });
  for (const row of sharing as Array<{ slug: string }>) {
    if (row.slug !== currentSlug) revalidatePath(`/setores/${row.slug}`);
  }
}
```

- [ ] **Step 2: Apagar as quatro funções de `cronograma-actions.ts` e importar**

Em `src/lib/cronograma-actions.ts`:

1. Remova as definições de `requireUser`, `requireAuthor`, `requireScope` e `revalidateScope` (o bloco que vai do comentário `/** Criar conteúdo é aberto ... */` até o fechamento de `revalidateScope`).
2. Troque o bloco de imports do topo por:

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { toScheduledDate, canDeletePost } from "@/lib/cronograma-data";
import { defaultVisibilityForSlug } from "@/lib/cronograma-visibility";
import {
  requireAuthor,
  requireScope,
  requireUser,
  revalidateScope,
} from "@/lib/cronograma-guards";
import type { Role } from "@/types";
```

(`revalidatePath`, `resolveAccessibleSlugs`, `canAccessSlug`, `resolveAppScope` e `canEditPost` deixam de ser usados neste arquivo — `noUnusedLocals` acusa se sobrar algum.)

- [ ] **Step 3: Typecheck, lint e testes**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo limpo. O comportamento não mudou; só o endereço das funções.

- [ ] **Step 4: Commit**

```bash
git add src/lib/cronograma-guards.ts src/lib/cronograma-actions.ts
git commit -m "Cronograma: os guardas de autoria saem da action para um módulo reutilizável"
```

---

### Task 8: Actions do roteiro — `script-actions.ts`

**Files:**
- Create: `src/lib/ai/script-actions.ts`

**Interfaces:**
- Consumes: guardas (Task 7), `loadAiRuntime`, `aiRateKey`, `AI_RATE_LIMIT`, `AI_RATE_WINDOW_MS` (Task 6), `generateText` (Task 5), `buildScriptPrompt`, `composeSystemInstruction` (Task 4), `SCRIPT_MAX` (Task 4), `consume` de `@/lib/rate-limit`, `ActionResult` de `@/lib/cronograma-actions`.
- Produces: `generatePostScript({ id, slug }): Promise<ActionResult>` e `savePostScript({ id, slug, body }): Promise<ActionResult>`. Task 11 usa.

- [ ] **Step 1: Criar o arquivo**

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consume } from "@/lib/rate-limit";
import { requireAuthor, requireScope, requireUser, revalidateScope } from "@/lib/cronograma-guards";
import type { ActionResult } from "@/lib/cronograma-actions";
import { generateText } from "./gemini";
import { buildScriptPrompt, composeSystemInstruction } from "./script-prompt";
import { AI_RATE_LIMIT, AI_RATE_WINDOW_MS, aiRateKey, loadAiRuntime } from "./settings-data";
import { SCRIPT_MAX } from "./scopes";

/**
 * Roteiro do card: gerar pela IA e salvar a edição à mão.
 *
 * Gerar segue a regra de EDITAR o card (autor ou Admin) — é a mesma
 * `requireAuthor` das outras escritas — e passa por um teto de 20 por hora
 * por pessoa: cada chamada custa dinheiro, e um `for` no console não pode
 * virar fatura.
 *
 * Falha do Gemini NÃO toca o banco: o roteiro que já estava no card fica.
 */

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isoTime(value: Date): string {
  return value.toISOString().slice(11, 16);
}

export async function generatePostScript(input: {
  id: string;
  slug: string;
}): Promise<ActionResult> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? undefined };

  const { scope, error: scopeError } = await requireScope(input.slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const { error: authorError } = await requireAuthor(input.id, scope.id, user);
  if (authorError) return { ok: false, error: authorError };

  const limit = await consume(aiRateKey(user.id), AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
  if (!limit.ok) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return { ok: false, error: `Limite de roteiros por hora atingido. Tente em ${minutes} min.` };
  }

  const runtime = await loadAiRuntime();
  if (!runtime.ok) return { ok: false, error: runtime.error };

  const post = await prisma.contentPost.findFirst({
    where: { id: input.id, subsectorId: scope.id },
    select: {
      title: true,
      scheduledAt: true,
      funnel: true,
      formats: true,
      formatOther: true,
      status: true,
      brand: true,
      platforms: true,
      notes: true,
      owner: { select: { fullName: true } },
    },
  });
  if (!post) return { ok: false, error: "Post não encontrado." };

  const prompt = buildScriptPrompt({
    title: post.title,
    date: isoDate(post.scheduledAt),
    time: isoTime(post.scheduledAt),
    funnel: post.funnel,
    formats: post.formats,
    formatOther: post.formatOther ?? undefined,
    status: post.status,
    brand: post.brand ?? undefined,
    platforms: post.platforms,
    notes: post.notes ?? undefined,
    ownerName: post.owner?.fullName,
  });
  const systemInstruction = composeSystemInstruction(
    runtime.instructions.DEFAULT ?? null,
    post.brand ? (runtime.instructions[post.brand] ?? null) : null,
  );

  const result = await generateText({
    apiKey: runtime.apiKey,
    model: runtime.model,
    systemInstruction,
    prompt,
  });
  if (!result.ok) return { ok: false, error: result.error };

  try {
    const updated = await prisma.contentPost.updateMany({
      where: { id: input.id, subsectorId: scope.id },
      data: { script: result.text, scriptUpdatedAt: new Date(), scriptById: user.id },
    });
    if (updated.count === 0) return { ok: false, error: "Post não encontrado." };
  } catch (e) {
    console.error("[generatePostScript] db:", e);
    return { ok: false, error: "O roteiro foi gerado, mas não pôde ser salvo. Tente de novo." };
  }

  await revalidateScope(scope.id, input.slug);
  return { ok: true };
}

const saveSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  body: z.string().max(SCRIPT_MAX, `O roteiro tem no máximo ${SCRIPT_MAX} caracteres.`),
});

/** Edição à mão. Corpo vazio apaga o roteiro (os três campos vão a nulo). */
export async function savePostScript(input: {
  id: string;
  slug: string;
  body: string;
}): Promise<ActionResult> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const body = parsed.data.body.trim();

  const { scope, error: scopeError } = await requireScope(parsed.data.slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const { error: authorError } = await requireAuthor(parsed.data.id, scope.id, user);
  if (authorError) return { ok: false, error: authorError };

  try {
    const updated = await prisma.contentPost.updateMany({
      where: { id: parsed.data.id, subsectorId: scope.id },
      data: body
        ? { script: body, scriptUpdatedAt: new Date(), scriptById: user.id }
        : { script: null, scriptUpdatedAt: null, scriptById: null },
    });
    if (updated.count === 0) return { ok: false, error: "Post não encontrado." };
  } catch (e) {
    console.error("[savePostScript] db:", e);
    return { ok: false, error: "Falha ao salvar o roteiro." };
  }

  await revalidateScope(scope.id, parsed.data.slug);
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: limpo. Se o TypeScript reclamar que `post.formats` (tipo Prisma `$Enums.ContentFormat[]`) não bate com `readonly ContentFormat[]`, os enums são os mesmos literais — o erro não deve ocorrer; se ocorrer, tipe o `select` com `satisfies` ou converta com `as ContentFormat[]` importando o tipo de `@/types/cronograma`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/script-actions.ts
git commit -m "IA: gerar e salvar o roteiro do card, com a autoria do Editar e 20 por hora"
```

---

### Task 9: O roteiro chega ao card — tipos e leitura

**Files:**
- Modify: `src/types/cronograma.ts:36-68` (`ContentPostItem`) e `:88-113` (`CronogramaData`)
- Modify: `src/lib/cronograma-data.ts:71-87` (`PostRow`), `:131-158` (`toItem`), `:196-215` (`select`), `:161-170` e `:247-262` (`getCronogramaData`)

**Interfaces:**
- Consumes: `isAiReady` (Task 6).
- Produces: `ContentPostItem.script?: string`, `scriptUpdatedAt?: string` (ISO), `scriptAuthorName?: string`; `CronogramaData.aiReady: boolean`. Task 11 usa.

- [ ] **Step 1: Tipos**

Em `src/types/cronograma.ts`, dentro de `ContentPostItem`, após `canDelete: boolean;`:

```ts
  /** Roteiro gerado pela IA (ou editado à mão). Ausente = nunca gerado. */
  script?: string;
  /** ISO de quando o roteiro foi gerado/editado por último. */
  scriptUpdatedAt?: string;
  /** Quem gerou/editou o roteiro por último, para o rodapé da seção. */
  scriptAuthorName?: string;
```

Em `CronogramaData`, após `authoring: ContentVisibility;`:

```ts
  /**
   * Há chave do Gemini salva na Retaguarda? Liga o botão "Roteiro" nos
   * cards. Sem chave, nada de IA aparece — nem botão, nem seção vazia.
   */
  aiReady: boolean;
```

- [ ] **Step 2: `PostRow` e `toItem`**

Em `src/lib/cronograma-data.ts`, acrescente a `PostRow` (após `owner`):

```ts
  script: string | null;
  scriptUpdatedAt: Date | null;
  scriptBy: { fullName: string } | null;
```

Em `toItem`, após `canDelete: canDeletePost(row.createdById, userId, role),`:

```ts
    script: row.script ?? undefined,
    scriptUpdatedAt: row.scriptUpdatedAt?.toISOString(),
    scriptAuthorName: row.scriptBy?.fullName ?? undefined,
```

- [ ] **Step 3: `select` e `aiReady`**

No `select` do `findMany` de `getCronogramaData`, após `owner: { select: { id: true, fullName: true, avatarPath: true } },`:

```ts
      script: true,
      scriptUpdatedAt: true,
      scriptBy: { select: { fullName: true } },
```

No topo de `getCronogramaData`, troque

```ts
  const scope = await resolveAppScope(slug);
  if (!scope || !scope.scheduleEnabled) return null;
```

por

```ts
  const [scope, aiReady] = await Promise.all([resolveAppScope(slug), isAiReady()]);
  if (!scope || !scope.scheduleEnabled) return null;
```

e no objeto devolvido no fim, após `authoring: defaultVisibilityForSlug(slug),`:

```ts
    aiReady,
```

Import no topo do arquivo:

```ts
import { isAiReady } from "@/lib/ai/settings-data";
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: limpo. (`aiReady` é obrigatório em `CronogramaData` — se algum outro lugar construir esse objeto, o compilador aponta.)

- [ ] **Step 5: Commit**

```bash
git add src/types/cronograma.ts src/lib/cronograma-data.ts
git commit -m "Cronograma: o card carrega o roteiro e a tela sabe se a IA está ligada"
```

---

### Task 10: Aba "Inteligência Artificial" na Retaguarda

**Files:**
- Create: `src/components/it/ai-settings-panel.tsx`
- Modify: `src/app/setores/ti/page.tsx:22-30` e `:48-56`
- Modify: `src/components/it/it-sector-view.tsx:25-32` (TABS), `:34-41` (props), `:88-100` (Tabs) e o `TabPanel`

**Interfaces:**
- Consumes: `AiSettingsView`, `getAiSettingsView` (Task 6); `saveAiCredentials`, `removeAiKey`, `saveAiInstruction`, `testAiConnection` (Task 6); `AI_SCOPES`, `AI_SCOPE_LABEL`, `AI_SCOPE_HINT`, `INSTRUCTION_MAX`, `MODEL_MAX`, `API_KEY_MAX` (Task 4); `can("ai.manage")` (Task 1).
- Produces: `ItSectorViewProps.aiSettings?: AiSettingsView | null`.

- [ ] **Step 1: Página carrega a configuração só para quem pode**

Em `src/app/setores/ti/page.tsx`, acrescente os imports:

```ts
import { can } from "@/lib/permissions";
import { getAiSettingsView } from "@/lib/ai/settings-data";
```

Troque o `Promise.all` por:

```ts
  const canManageAi = can(session.role as Role, "ai.manage");

  const [content, tickets, dashboard, aiSettings] = await Promise.all([
    getSectorContent("ti", session.userId),
    // O quadro já sai do banco recortado: chamado atribuído a terceiro nem
    // chega a esta página (ver `lib/ticket-visibility`).
    getItTickets({ id: session.userId, role: session.role }),
    getItDashboard(),
    // Configuração da IA só desce para quem pode mexer nela — quem não é
    // Admin não recebe nem os 4 últimos caracteres da chave.
    canManageAi ? getAiSettingsView() : Promise.resolve(null),
  ]);
```

E no JSX, acrescente a prop:

```tsx
    <ItSectorView
      welcome={welcome}
      content={safeContent}
      tickets={tickets}
      dashboard={dashboard}
      evaluations={evaluations}
      aiSettings={aiSettings}
    />
```

- [ ] **Step 2: Aba condicional na view**

Em `src/components/it/it-sector-view.tsx`:

Imports novos:

```ts
import { AiSettingsPanel } from "@/components/it/ai-settings-panel";
import type { AiSettingsView } from "@/lib/ai/settings-data";
```

`TABS` ganha a última entrada:

```ts
const TABS: readonly TabItem[] = [
  { id: "instrucoes-video", label: "Instruções em Vídeo" },
  { id: "documentos", label: "Documentos" },
  { id: "chamados", label: "Chamados" },
  { id: "dashboard", label: "Dashboard" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "sites", label: "Aplicativos" },
  { id: "ia", label: "Inteligência Artificial" },
];
```

Props:

```ts
export interface ItSectorViewProps {
  content: SectorContent;
  tickets: ItTicket[];
  dashboard: ItDashboardData;
  evaluations?: SectorEvaluations | null;
  /** Vídeo de boas-vindas do setor (modal + card de gestão). */
  welcome?: SectorWelcomeVideoData | null;
  /** Configuração da IA. Nulo para quem não tem `ai.manage` — a aba some. */
  aiSettings?: AiSettingsView | null;
}
```

Adicione `aiSettings` à desestruturação dos parâmetros. Logo após `const canUpload = can("content.upload");`:

```ts
  // A aba de IA só existe para quem pode configurá-la. A checagem é dupla de
  // propósito: a permissão diz quem PODE, e a prop diz que o servidor de fato
  // ENVIOU a configuração — sem uma das duas, a aba nem é listada.
  const showAi = can("ai.manage") && aiSettings != null;
  const tabs = showAi ? TABS : TABS.filter((tab) => tab.id !== "ia");
```

No `<Tabs items={TABS} ...>` troque `items={TABS}` por `items={tabs}`.

No `TabPanel`, antes de `{fileModal && (`... não — dentro do `<TabPanel>`, após o bloco de `sites`:

```tsx
        {active === "ia" && showAi && aiSettings && <AiSettingsPanel settings={aiSettings} />}
```

- [ ] **Step 3: O painel**

Crie `src/components/it/ai-settings-panel.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, PlugZap, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  removeAiKey,
  saveAiCredentials,
  saveAiInstruction,
  testAiConnection,
} from "@/lib/ai/settings-actions";
import type { AiSettingsView } from "@/lib/ai/settings-data";
import {
  AI_SCOPES,
  AI_SCOPE_HINT,
  AI_SCOPE_LABEL,
  API_KEY_MAX,
  INSTRUCTION_MAX,
  MODEL_MAX,
  type AiScope,
} from "@/lib/ai/scopes";

export interface AiSettingsPanelProps {
  settings: AiSettingsView;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      className={cn(
        "mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
        notice.tone === "ok"
          ? "border-info/30 bg-info/10 text-foreground"
          : "border-danger/30 bg-danger/10 text-danger",
      )}
    >
      {notice.tone === "ok" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
      {notice.text}
    </p>
  );
}

/**
 * Conexão com o Gemini: chave, modelo, testar, remover.
 *
 * O campo da chave nunca é preenchido pelo servidor — o placeholder mostra
 * "••••" + os 4 últimos caracteres da chave salva, e deixar em branco ao
 * salvar significa "manter". Apagar é um botão próprio, com confirmação.
 */
function ConnectionCard({ settings }: { settings: AiSettingsView }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(settings.model);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();

  useEffect(() => setModel(settings.model), [settings.model]);

  function save() {
    setNotice(null);
    start(async () => {
      const res = await saveAiCredentials({ apiKey: apiKey.trim() || undefined, model });
      if (res.ok) {
        setApiKey("");
        setNotice({ tone: "ok", text: "Configuração salva." });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: res.error ?? "Falha ao salvar." });
      }
    });
  }

  function test() {
    setNotice(null);
    start(async () => {
      const res = await testAiConnection();
      setNotice(
        res.ok
          ? { tone: "ok", text: `Conexão OK · ${res.model ?? settings.model}` }
          : { tone: "error", text: res.error ?? "Falha ao testar." },
      );
    });
  }

  function remove() {
    setNotice(null);
    start(async () => {
      const res = await removeAiKey();
      setConfirmRemove(false);
      if (res.ok) {
        setNotice({ tone: "ok", text: "Chave removida. O botão Roteiro deixa de aparecer no Cronograma." });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: res.error ?? "Falha ao remover." });
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <PlugZap className="h-4 w-4 text-primary" />
        Conexão com o Gemini
      </h3>
      <p className="mt-1 text-sm text-muted">
        A chave fica cifrada no banco e nunca volta a esta tela. Quem vê o Cronograma só
        ganha o botão &ldquo;Roteiro&rdquo; depois que ela está salva.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_260px]">
        <div>
          <Label htmlFor="ai-key">Chave da API</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={API_KEY_MAX}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.hasKey ? `••••••••••••${settings.keyHint ?? ""}` : "Cole a chave do AI Studio"}
              className="pl-9"
              disabled={pending}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {settings.hasKey
              ? "Deixe em branco para manter a chave atual."
              : "Sem chave salva. Nenhum roteiro pode ser gerado."}
          </p>
        </div>
        <div>
          <Label htmlFor="ai-model">Modelo</Label>
          <Input
            id="ai-model"
            maxLength={MODEL_MAX}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-2.5-flash"
            disabled={pending}
          />
          <p className="mt-1 text-[11px] text-muted">Nome exato do modelo, como no Google AI Studio.</p>
        </div>
      </div>

      <NoticeBar notice={notice} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {settings.hasKey ? (
          <Button
            variant="secondary"
            onClick={() => setConfirmRemove(true)}
            disabled={pending}
            className="text-danger"
          >
            <Trash2 className="h-4 w-4" />
            Remover chave
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          {settings.hasKey && (
            <Button variant="secondary" onClick={test} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Testar conexão
            </Button>
          )}
          <Button onClick={save} disabled={pending || model.trim().length === 0}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>

      {confirmRemove && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-4">
          <p className="text-sm text-foreground">
            Remover a chave? O botão &ldquo;Roteiro&rdquo; some de todos os cronogramas. Os
            roteiros já gerados continuam nos cards.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmRemove(false)} disabled={pending}>
              Manter
            </Button>
            <Button variant="danger" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remover
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Instruções do sistema, uma sub-aba por escopo. Cada sub-aba tem o seu
 * rascunho e o seu Salvar: salvar a OKEY não toca a Padrão.
 */
function InstructionsCard({ settings }: { settings: AiSettingsView }) {
  const router = useRouter();
  const [scope, setScope] = useState<AiScope>("DEFAULT");
  const [drafts, setDrafts] = useState<Record<AiScope, string>>(() =>
    Object.fromEntries(AI_SCOPES.map((s) => [s, settings.instructions[s].body])) as Record<AiScope, string>,
  );
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();

  // Dados novos do servidor (após refresh) sobrescrevem o rascunho — o que
  // está no banco é a verdade; o rascunho só existe entre digitar e salvar.
  useEffect(() => {
    setDrafts(
      Object.fromEntries(AI_SCOPES.map((s) => [s, settings.instructions[s].body])) as Record<AiScope, string>,
    );
  }, [settings.instructions]);

  const current = drafts[scope];
  const saved = settings.instructions[scope];
  const dirty = current !== saved.body;

  function save() {
    setNotice(null);
    start(async () => {
      const res = await saveAiInstruction({ scope, body: current });
      if (res.ok) {
        setNotice({ tone: "ok", text: `Instrução ${AI_SCOPE_LABEL[scope]} salva.` });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: res.error ?? "Falha ao salvar." });
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        Instruções do sistema
      </h3>
      <p className="mt-1 text-sm text-muted">
        A instrução Padrão vale para todo roteiro. A da marca é acrescentada depois dela
        quando o card tem marca. Sem nenhuma instrução, a IA usa um texto mínimo.
      </p>

      <div role="tablist" className="mt-4 flex w-fit gap-1 rounded-lg border border-border bg-surface-2 p-1">
        {AI_SCOPES.map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={scope === s}
            onClick={() => {
              setScope(s);
              setNotice(null);
            }}
            className={cn(
              "focus-ring rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              scope === s
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface-3 hover:text-foreground",
            )}
          >
            {AI_SCOPE_LABEL[s]}
            {drafts[s] !== settings.instructions[s].body && " •"}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">{AI_SCOPE_HINT[scope]}</p>

      <Textarea
        rows={12}
        maxLength={INSTRUCTION_MAX}
        value={current}
        onChange={(e) => setDrafts((d) => ({ ...d, [scope]: e.target.value }))}
        placeholder={
          scope === "DEFAULT"
            ? "Ex.: Você é roteirista da equipe de conteúdo. Escreva em português do Brasil, em até 60 segundos de fala, com gancho nos 3 primeiros segundos…"
            : `Ex.: Quando o card for da ${AI_SCOPE_LABEL[scope]}, use tom…`
        }
        className="mt-3 font-mono text-[13px] leading-relaxed"
        disabled={pending}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>
          {current.length} / {INSTRUCTION_MAX}
        </span>
        {saved.updatedAt && (
          <span>
            Salvo por {saved.updatedByName ?? "—"} · {formatWhen(saved.updatedAt)}
          </span>
        )}
      </div>

      <NoticeBar notice={notice} />

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={pending || !dirty}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </section>
  );
}

/**
 * Aba "Inteligência Artificial" da Retaguarda. Só o Admin chega aqui
 * (`ai.manage`); a página nem envia `settings` para os demais.
 */
export function AiSettingsPanel({ settings }: AiSettingsPanelProps) {
  return (
    <div className="space-y-5">
      <ConnectionCard settings={settings} />
      <InstructionsCard settings={settings} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: limpo. (`info`, `warning` e `danger` são os tons que existem em `tailwind.config.ts`; não há `success` — por isso a faixa verde usa `info`.)

- [ ] **Step 5: Ver no navegador**

Run: `npm run dev`, entre como Admin, abra `/setores/ti`.
Expected: a aba "Inteligência Artificial" aparece por último; sem chave, o campo mostra "Cole a chave do AI Studio" e só há `Salvar`. Salve uma chave qualquer: o placeholder vira `••••••••••••xxxx`, aparecem `Remover chave` e `Testar conexão`. Entre como Gestor: a aba não existe.

- [ ] **Step 6: Commit**

```bash
git add src/app/setores/ti/page.tsx src/components/it/it-sector-view.tsx src/components/it/ai-settings-panel.tsx
git commit -m "Retaguarda ganha a aba Inteligência Artificial: chave, modelo e instruções por marca"
```

---

### Task 11: O botão "Roteiro" e a seção no modal de detalhes

**Files:**
- Create: `src/components/cronograma/post-script.tsx`
- Modify: `src/components/cronograma/post-details-modal.tsx` (props, seção após Observações, barra de ações)
- Modify: `src/components/cronograma/cronograma-panel.tsx:551-557` (passa `aiReady`)

**Interfaces:**
- Consumes: `generatePostScript`, `savePostScript` (Task 8); `ContentPostItem.script/scriptUpdatedAt/scriptAuthorName`, `CronogramaData.aiReady` (Task 9); `SCRIPT_MAX` (Task 4).
- Produces: `PostScript` com props `{ slug; post; aiReady; busy; onBusyChange }` e `PostDetailsModalProps.aiReady: boolean`.

- [ ] **Step 1: Criar `post-script.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generatePostScript, savePostScript } from "@/lib/ai/script-actions";
import { SCRIPT_MAX } from "@/lib/ai/scopes";
import type { ContentPostItem } from "@/types/cronograma";

export interface PostScriptProps {
  slug: string;
  post: ContentPostItem;
  /** Há chave do Gemini salva? Sem ela, nada de IA aparece. */
  aiReady: boolean;
  /** Outra ação do modal (excluir) está em andamento. */
  busy: boolean;
  /** Avisa o modal que gerar/salvar começou ou terminou. */
  onBusyChange: (busy: boolean) => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

/**
 * Seção "Roteiro" do modal de detalhes.
 *
 * Seis estados, cruzando `aiReady` × `post.script` × `post.canEdit` (tabela
 * na spec §6.2). Em resumo: sem chave, só o que já foi salvo aparece; com
 * chave, quem edita o card gera e regera; quem só lê, só lê.
 *
 * Gerar e salvar terminam em `router.refresh()`: o modal relê o post de
 * `data.posts`, então o texto novo chega sem estado local duplicado.
 * Falha de IA fica na faixa vermelha e o texto anterior permanece.
 */
export function PostScript({ slug, post, aiReady, busy, onBusyChange }: PostScriptProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.script ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Post trocou (outro card) ou chegou texto novo: recomeça do zero.
  useEffect(() => {
    setConfirming(false);
    setEditing(false);
    setDraft(post.script ?? "");
    setError(null);
  }, [post.id, post.script]);

  useEffect(() => onBusyChange(pending), [pending, onBusyChange]);

  const hasScript = Boolean(post.script);
  const canGenerate = aiReady && post.canEdit;
  const disabled = pending || busy;

  function generate() {
    setError(null);
    setConfirming(false);
    start(async () => {
      const res = await generatePostScript({ id: post.id, slug });
      if (res.ok) router.refresh();
      else setError(res.error ?? "Falha ao gerar o roteiro.");
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await savePostScript({ id: post.id, slug, body: draft });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao salvar o roteiro.");
      }
    });
  }

  // Nada a mostrar: sem roteiro salvo e sem como gerar.
  if (!hasScript && !canGenerate) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <Sparkles className="h-3 w-3" />
          Roteiro
        </p>
        {hasScript && post.canEdit && !editing && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={disabled}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
            {aiReady && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={disabled}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Gerar novamente
              </Button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <Textarea
            rows={10}
            maxLength={SCRIPT_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            className="text-[13px] leading-relaxed"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">
              {draft.length} / {SCRIPT_MAX}
              {draft.trim().length === 0 && " · salvar vazio remove o roteiro"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(post.script ?? "");
                  setError(null);
                }}
                disabled={disabled}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={save} disabled={disabled}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      ) : hasScript ? (
        <>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {post.script}
          </p>
          {post.scriptUpdatedAt && (
            <p className="mt-2 text-[11px] text-muted">
              Gerado por {post.scriptAuthorName ?? "—"} · {formatWhen(post.scriptUpdatedAt)}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-sm text-muted">
          Nenhum roteiro ainda. Clique em <span className="font-semibold">Roteiro</span> para a IA
          escrever um a partir dos campos deste card.
        </p>
      )}

      {pending && !editing && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Gerando roteiro… isso leva alguns segundos.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {confirming && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="text-sm text-foreground">
            Gerar novamente substitui o roteiro atual. Continuar?
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={disabled}>
              Manter
            </Button>
            <Button size="sm" onClick={generate} disabled={disabled}>
              <Sparkles className="h-3.5 w-3.5" />
              Gerar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * O botão da barra de ações — só quando ainda NÃO há roteiro. Depois que
 * existe, gerar de novo é o "Gerar novamente" da seção, com confirmação.
 *
 * O erro sobe para o modal (`onError`), que já tem a faixa de erro do
 * Excluir — assim não há duas faixas vermelhas na mesma tela.
 */
export function GenerateScriptButton({
  slug,
  post,
  aiReady,
  busy,
  onBusyChange,
  onError,
}: PostScriptProps & { onError: (message: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => onBusyChange(pending), [pending, onBusyChange]);

  if (!aiReady || !post.canEdit || post.script) return null;

  function generate() {
    start(async () => {
      const res = await generatePostScript({ id: post.id, slug });
      if (res.ok) router.refresh();
      else onError(res.error ?? "Falha ao gerar o roteiro.");
    });
  }

  return (
    <Button variant="outline" onClick={generate} disabled={pending || busy} className="h-11">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {pending ? "Gerando…" : "Roteiro"}
    </Button>
  );
}
```

- [ ] **Step 2: Integrar no modal de detalhes**

Em `src/components/cronograma/post-details-modal.tsx`:

Imports novos:

```ts
import { useCallback } from "react"; // junte ao import de react existente
import { GenerateScriptButton, PostScript } from "./post-script";
```

Props:

```ts
export interface PostDetailsModalProps {
  slug: string;
  open: boolean;
  post: ContentPostItem | null;
  onClose: () => void;
  /** Abre o formulário de edição para este post. */
  onEdit: (post: ContentPostItem) => void;
  /** Há chave do Gemini salva? Liga o botão "Roteiro" e a seção de roteiro. */
  aiReady: boolean;
}
```

Dentro do componente, após `const [pending, start] = useTransition();`:

```ts
  // Gerar/salvar roteiro acontece dentro de PostScript; o modal só precisa
  // saber que algo está rodando para travar Fechar/Editar/Excluir.
  const [scriptBusy, setScriptBusy] = useState(false);
  const onBusyChange = useCallback((busy: boolean) => setScriptBusy(busy), []);
  const anyPending = pending || scriptBusy;
```

Troque **todas** as ocorrências de `disabled={pending}` no JSX do modal por `disabled={anyPending}`, e em `handleClose` troque `if (pending) return;` por `if (anyPending) return;`.

Logo após o bloco de Observações (o `<div className="mt-3 rounded-lg ...">` que termina com `Nenhuma observação registrada.`), insira:

```tsx
        <PostScript
          slug={slug}
          post={post}
          aiReady={aiReady}
          busy={pending}
          onBusyChange={onBusyChange}
        />
```

Na barra de ações, dentro do `<div className="flex gap-3">`, entre o botão `Fechar` e o `Editar`:

```tsx
            <GenerateScriptButton
              slug={slug}
              post={post}
              aiReady={aiReady}
              busy={pending}
              onBusyChange={onBusyChange}
              onError={setError}
            />
```

- [ ] **Step 3: Passar `aiReady` do painel**

Em `src/components/cronograma/cronograma-panel.tsx`, no `<PostDetailsModal ...>`:

```tsx
      <PostDetailsModal
        slug={slug}
        open={detailsPost !== null}
        post={detailsPost}
        onClose={() => setDetailsId(null)}
        onEdit={openEdit}
        aiReady={data.aiReady}
      />
```

- [ ] **Step 4: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: limpo.

- [ ] **Step 5: Ver no navegador**

Com a chave salva (Task 10) e uma instrução Padrão escrita: `npm run dev`, entre como Admin, `/setores/marketing` → Cronograma → abra um card seu.
Expected: botão `Roteiro` entre Fechar e Editar; clicar mostra "Gerando…" e, ao terminar, a seção "Roteiro" com o texto e "Gerado por … · dd/mm hh:mm"; o botão da barra some. `Gerar novamente` pede confirmação. `Editar` abre o textarea; apagar tudo e salvar remove a seção e o botão volta. Feche e reabra o card: o roteiro está lá. Remova a chave na Retaguarda: o botão some; a seção com o texto continua. Entre como Colaborador de outro setor que enxerga um card público com roteiro: vê o texto, não vê botão.

- [ ] **Step 6: Commit**

```bash
git add src/components/cronograma/post-script.tsx src/components/cronograma/post-details-modal.tsx src/components/cronograma/cronograma-panel.tsx
git commit -m "Cronograma: o card ganha o botão Roteiro, e o roteiro fica salvo no card"
```

---

### Task 12: `.env.example`, verificação final e push

**Files:**
- Modify: `.env.example` (fim do arquivo)

- [ ] **Step 1: Documentar onde a chave mora**

Acrescente ao fim de `.env.example`:

```
# ─── Inteligência Artificial (Gemini) ─────────────────────────────────────
# NÃO existe variável de chave. A chave da API do Gemini é colada pelo Admin
# na aba "Inteligência Artificial" da Retaguarda e fica CIFRADA no banco
# (tabela AiSettings), com chave de cifra derivada do SESSION_SECRET acima.
# Trocar o SESSION_SECRET torna a chave ilegível — basta colá-la de novo.
```

- [ ] **Step 2: Verificação completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todos os testes passam (os 3 arquivos novos de `src/lib/ai/` + `permissions` + os existentes); typecheck, lint e build sem erro.

- [ ] **Step 3: Commit e push**

```bash
git add .env.example
git commit -m "env.example: a chave do Gemini fica no banco, pela Retaguarda"
git push origin main
```

- [ ] **Step 4: Depois do deploy — roteiro de ponta a ponta (spec §9)**

1. Entrar como Admin → Retaguarda → aba "Inteligência Artificial".
2. Colar a chave → `Salvar` → `Testar conexão` → faixa verde "Conexão OK · gemini-2.5-flash". Se vier "modelo não existe", trocar o nome do modelo pelo que o AI Studio lista.
3. Escrever a instrução Padrão e a da OKEY → `Salvar` em cada uma.
4. Marketing → Cronograma → abrir um card próprio da OKEY → `Roteiro` → texto aparece, persiste ao fechar/reabrir.
5. Entrar como Colaborador de outro setor que vê o card público → vê o roteiro, não vê o botão.
6. Retaguarda → `Remover chave` → o botão some do Cronograma; o roteiro fica.
7. **Rotacionar a chave no AI Studio** e colar a nova — a original passou por chat em texto puro.
