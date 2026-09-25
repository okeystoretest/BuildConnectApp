# Linha do tempo de atividade (DHO) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O bloco "Atividade" no Histórico do Colaborador mostra a linha do tempo do que uma pessoa fez na plataforma, do cadastro ao último evento, paginada e ao lado do bloco "Média".

**Architecture:** Híbrido. Nove fontes de evento: oito derivadas de tabelas que já existem e uma tabela nova (`ActivityEvent`) só para login e logout, que não têm origem no banco porque a sessão é um cookie assinado sem estado. Um núcleo puro funde as nove listas numa ordem total e pagina por cursor composto; uma Server Action serve as páginas.

**Tech Stack:** Next.js 15.5 (App Router, Server Actions), Prisma 6.19 + Postgres, TypeScript strict, `node:test` via `tsx`, Tailwind.

**Spec:** [docs/superpowers/specs/2026-09-25-linha-do-tempo-atividade-design.md](../specs/2026-09-25-linha-do-tempo-atividade-design.md)

## Global Constraints

- **Página de 30 eventos.** `ACTIVITY_PAGE_SIZE = 30`. Cada uma das nove consultas usa `take: ACTIVITY_PAGE_SIZE + 1` (31) — é o que torna o "tem mais?" demonstrável, ver Task 3.
- **Ordem total:** `occurredAt` desc, depois `id` composto asc. Nunca só por data.
- **Id composto:** `${kind}:${idDaOrigem}`. O tipo é prefixo do id, então comparar ids lexicograficamente já desempata por tipo — o cursor e o comparador usam a mesma regra, e não podem divergir.
- **Fuso:** todo rótulo de data/hora sai de [src/lib/brasilia.ts](../../../src/lib/brasilia.ts). Nunca `getHours()`/`getDate()` — o container nasce em UTC.
- **Permissão:** reusar `requireDhoAdmin` de [src/lib/hr-actions-history.ts](../../../src/lib/hr-actions-history.ts). **Correção à §7 da spec:** o portão do módulo não é Admin-only, é `canAdministerDho` (Admin **ou** Gestor lotado no DHO). Nenhuma permissão nova.
- **Escrita de log nunca derruba a ação:** `try/catch` com `console.error`. Um log de auditoria que impede alguém de entrar na plataforma é pior que um log com buraco.
- **`onDelete: Cascade`** no `ActivityEvent`, pela política já registrada no `Ticket`: excluir um usuário é apagar tudo dele.
- **Migrations são SQL escrito à mão**, em `prisma/migrations/YYYYMMDDHHMMSS_nome/migration.sql`. O repo não usa `migrate dev` para gerar.
- **Comentários em português, explicando o POR QUÊ**, no padrão do repo. Comentário que repete o código não entra.

## Review Focus

Cinco modos de falha que a spec implica e que nenhum teste pegaria por acidente. Cada um tem o teste apontado na task que é dona do código.

1. **`ContentProgress` de documento tem `endedAt` nulo** (o schema diz "Nulo nos documentos"). Sem filtrar `videoId: { not: null }` **e** `endedAt: { not: null }`, documento lido vira "vídeo assistido" ou evento sem data. → Task 4, Step 1.
2. **Empate de milissegundo na virada de página.** Dois eventos gravados na mesma transação caem no mesmo instante; se um está no fim da página 1, o cursor não pode perdê-lo nem repeti-lo. → Task 3, Step 7.
3. **`logout` com sessão já expirada.** `getSession()` devolve nulo; não pode gravar evento órfão nem impedir o redirect para `/login`. → Task 2, Step 5.
4. **Colaborador sem nenhum evento além do cadastro.** Conta recém-criada: uma linha só, `nextCursor` nulo, sem botão "carregar mais", sem divisão por zero em lugar nenhum. → Task 5, Step 5.
5. **Avaliador removido do cadastro.** `Evaluation.evaluatorId` é `onDelete: SetNull`: a avaliação continua valendo sem o nome. O evento precisa dizer "—", não `undefined` nem quebrar. → Task 4, Step 9.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` (modificar) | Enum `ActivityEventKind` + modelo `ActivityEvent` |
| `prisma/migrations/20260925120000_activity_event/migration.sql` (criar) | A migration |
| `src/lib/activity-log.ts` (criar) | Gravar `ActivityEvent`. Só escrita, e nunca lança |
| `src/lib/auth/actions.ts` (modificar) | Chamar o log no login e no logout |
| `src/lib/activity-timeline.ts` (criar) | **Núcleo puro:** tipos, ordem total, cursor, fusão. Zero Prisma |
| `src/lib/activity-timeline-data.ts` (criar) | As nove consultas e o mapeamento de cada origem |
| `src/lib/activity-timeline-actions.ts` (criar) | Server Action de paginação |
| `src/lib/hr-history-data.ts` (modificar) | Primeira página junto do `EmployeeHistory` |
| `src/types/hr.ts` (modificar) | `EmployeeHistory` carrega a primeira página |
| `src/components/hr/activity-timeline.tsx` (criar) | O bloco na tela |
| `src/components/hr/employee-history.tsx` (modificar) | Grade `[1fr_18rem]`: Atividade + Média |

O núcleo puro fica separado da consulta pelo mesmo motivo que em `sector-overview.ts`/`sector-overview-data.ts`: é onde mora o risco (ordem, cursor, fusão) e é o que dá para testar sem banco.

---

## Task 1: Tabela `ActivityEvent`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260925120000_activity_event/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: modelo `ActivityEvent` com campos `id`, `userId`, `kind` (`ActivityEventKind`: `LOGIN` | `LOGOUT`), `meta` (`Json?`), `occurredAt` (`DateTime`), índice `[userId, occurredAt]`.

- [ ] **Step 1: Adicionar o enum e o modelo ao schema**

Em `prisma/schema.prisma`, imediatamente antes de `enum NotificationKind` (por volta da linha 1151), inserir:

```prisma
// ─────────────────────────────────────────────────────────────
// Registro de atividade
// ─────────────────────────────────────────────────────────────

enum ActivityEventKind {
  LOGIN
  LOGOUT
}

/// Eventos que não têm outra origem no banco.
///
/// Só entra aqui o que não pode ser derivado: login e logout, porque a sessão
/// é um cookie assinado e não deixa rastro no servidor. Vídeo assistido,
/// resposta de compreensão, chamado aberto e os demais JÁ têm data na tabela
/// deles e são lidos de lá — duplicá-los aqui criaria duas verdades sobre o
/// mesmo fato, que divergem no dia em que uma das duas for corrigida.
model ActivityEvent {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  kind ActivityEventKind

  /// Detalhe por tipo. Existe para o próximo tipo de evento não pedir
  /// migration; hoje LOGIN e LOGOUT não guardam nada.
  meta Json?

  occurredAt DateTime @default(now())

  @@index([userId, occurredAt])
}
```

- [ ] **Step 2: Declarar a relação no `User`**

No modelo `User`, ao lado de `welcomeViews` (por volta da linha 57), acrescentar:

```prisma
  // Registro de login/logout desta pessoa (ver ActivityEvent).
  activityEvents ActivityEvent[]
```

- [ ] **Step 3: Escrever a migration**

Criar `prisma/migrations/20260925120000_activity_event/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ActivityEventKind" AS ENUM ('LOGIN', 'LOGOUT');

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ActivityEventKind" NOT NULL,
    "meta" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_occurredAt_idx" ON "ActivityEvent"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Aplicar e gerar o client**

Run: `npx prisma migrate deploy && npm run db:generate`
Expected: a migration aparece como aplicada e o client regenera sem erro.

- [ ] **Step 5: Confirmar que o schema e o banco concordam**

Run: `npx prisma migrate status`
Expected: "Database schema is up to date!"

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sem saída (sucesso).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260925120000_activity_event
git commit -m "$(cat <<'EOF'
Atividade: tabela para os eventos que não têm outra origem

Login e logout são os únicos eventos da linha do tempo sem data no banco:
a sessão é um cookie assinado, sem estado no servidor. Tudo o mais é
derivado de onde já mora, e não duplicado aqui — duas verdades sobre o
mesmo fato divergem no dia em que uma delas for corrigida.

`meta` entra vazio, para o próximo tipo de evento não pedir migration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Gravar login e logout

**Files:**
- Create: `src/lib/activity-log.ts`
- Modify: `src/lib/auth/actions.ts` (função `login`, por volta da linha 88; função `logout`, linha 110)
- Test: `src/lib/activity-log.dbtest.ts`

**Interfaces:**
- Consumes: modelo `ActivityEvent` (Task 1); `getSession` de `@/lib/auth/session`.
- Produces: `recordActivity(userId: string, kind: "LOGIN" | "LOGOUT"): Promise<void>` — nunca lança.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/activity-log.dbtest.ts`:

```ts
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { recordActivity } from "./activity-log";

/**
 * A gravação do log de entrada/saída, contra o Postgres.
 *
 * O teste que importa é o último: gravar log não pode derrubar a ação. Se uma
 * falha de escrita aqui propagar, ninguém consegue entrar na plataforma.
 */

const MARK = "#ACTLOG";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let userId = "";

before(async () => {
  const u = await prisma.user.create({
    data: {
      username: `actlog-${stamp()}${MARK}`,
      fullName: `Registrado ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });
  userId = u.id;
});

after(async () => {
  await prisma.activityEvent.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

test("grava o login com a data do momento", async () => {
  await recordActivity(userId, "LOGIN");
  const rows = await prisma.activityEvent.findMany({ where: { userId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "LOGIN");
  assert.ok(rows[0]?.occurredAt instanceof Date);
});

test("grava o logout como evento separado", async () => {
  await recordActivity(userId, "LOGOUT");
  const rows = await prisma.activityEvent.findMany({ where: { userId } });
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.kind === "LOGOUT"));
});

test("usuário inexistente não derruba a ação — só registra no console", async () => {
  // A chave estrangeira recusa a escrita. `recordActivity` tem de absorver.
  await assert.doesNotReject(() => recordActivity("nao-existe-este-id", "LOGIN"));
});

test("o log de uma pessoa não aparece no de outra", async () => {
  const outro = await prisma.user.create({
    data: {
      username: `actlog2-${stamp()}${MARK}`,
      fullName: `Outro ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });
  await recordActivity(outro.id, "LOGIN");

  const meus = await prisma.activityEvent.findMany({ where: { userId } });
  assert.ok(!meus.some((r) => r.userId === outro.id));

  await prisma.activityEvent.deleteMany({ where: { userId: outro.id } });
  await prisma.user.deleteMany({ where: { id: outro.id } });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx --test --test-concurrency=1 "src/lib/activity-log.dbtest.ts"`
Expected: FAIL — `Cannot find module './activity-log'`.

- [ ] **Step 3: Implementar o gravador**

Criar `src/lib/activity-log.ts`:

```ts
import { prisma } from "@/lib/db/prisma";
import type { ActivityEventKind } from "@prisma/client";

/**
 * Grava um evento de atividade que não tem outra origem no banco.
 *
 * NUNCA lança. É chamado no caminho do login e do logout, e um log de
 * auditoria que impede alguém de entrar na plataforma é pior que um log com
 * buraco: a falha vai para o console, a ação segue.
 */
export async function recordActivity(userId: string, kind: ActivityEventKind): Promise<void> {
  try {
    await prisma.activityEvent.create({ data: { userId, kind } });
  } catch (error) {
    console.error(`[activity-log] falha ao gravar ${kind} de ${userId}:`, error);
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx --test --test-concurrency=1 "src/lib/activity-log.dbtest.ts"`
Expected: PASS, 4 testes.

- [ ] **Step 5: Ligar no login e no logout**

Em `src/lib/auth/actions.ts`, acrescentar ao bloco de imports:

```ts
import { recordActivity } from "@/lib/activity-log";
```

Na função `login`, entre o `await createSession({...})` e o `return { ok: true };`:

```ts
    await recordActivity(user.id, "LOGIN");

    return { ok: true };
```

Substituir a função `logout` inteira:

```ts
export async function logout(): Promise<void> {
  /*
   * O log é gravado ANTES de destruir a sessão: depois dela não há mais de
   * onde tirar o userId — o cookie é a única fonte.
   *
   * Sessão já expirada devolve nulo aqui. Nesse caso não há evento a gravar (e
   * gravar um evento sem dono não seria possível), mas o redirect tem de
   * acontecer de todo jeito: quem clicou em "sair" com a sessão vencida
   * precisa chegar ao /login como qualquer outro.
   */
  const session = await getSession();
  if (session) await recordActivity(session.userId, "LOGOUT");

  await destroySession();
  redirect("/login");
}
```

E ajustar o import de sessão, que hoje traz só duas funções:

```ts
import { createSession, destroySession, getSession } from "@/lib/auth/session";
```

- [ ] **Step 6: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/lib/activity-log.ts src/lib/activity-log.dbtest.ts src/lib/auth/actions.ts
git commit -m "$(cat <<'EOF'
Atividade: login e logout passam a ser registrados

Dois pontos de escrita, e a ordem do logout importa: o log vai antes de
destruir a sessão, porque depois dela o cookie já não diz de quem era.

Sessão vencida devolve nulo e não há evento a gravar, mas o redirect para
/login acontece igual — quem clicou em "sair" precisa chegar lá.

`recordActivity` nunca lança. Gravar auditoria não pode ser o motivo de
alguém não conseguir entrar na plataforma.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Núcleo puro — ordem total, cursor e fusão

**Files:**
- Create: `src/lib/activity-timeline.ts`
- Test: `src/lib/activity-timeline.test.ts`

**Interfaces:**
- Consumes: nada. Zero Prisma, zero I/O.
- Produces:
  - `type ActivityKind` (10 valores)
  - `interface ActivityItem { id: string; kind: ActivityKind; occurredAt: Date; title: string; detail?: string }`
  - `interface ActivityCursor { occurredAt: string; id: string }`
  - `const ACTIVITY_PAGE_SIZE = 30`
  - `activityId(kind: ActivityKind, sourceId: string): string`
  - `compareActivity(a: ActivityItem, b: ActivityItem): number`
  - `isAfterCursor(item: ActivityItem, cursor: ActivityCursor): boolean`
  - `mergeActivity(sources: readonly (readonly ActivityItem[])[], cursor?: ActivityCursor | null, pageSize?: number): { events: ActivityItem[]; nextCursor: ActivityCursor | null }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/activity-timeline.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_PAGE_SIZE,
  activityId,
  compareActivity,
  isAfterCursor,
  mergeActivity,
  type ActivityItem,
} from "./activity-timeline";

const at = (iso: string) => new Date(iso);

function item(kind: ActivityItem["kind"], sourceId: string, iso: string): ActivityItem {
  return { id: activityId(kind, sourceId), kind, occurredAt: at(iso), title: `${kind} ${sourceId}` };
}

test("o id composto leva o tipo como prefixo", () => {
  assert.equal(activityId("LOGIN", "abc"), "LOGIN:abc");
});

test("a ordem é decrescente por data", () => {
  const velho = item("LOGIN", "a", "2026-01-01T10:00:00.000Z");
  const novo = item("LOGIN", "b", "2026-02-01T10:00:00.000Z");
  assert.ok(compareActivity(novo, velho) < 0);
  assert.ok(compareActivity(velho, novo) > 0);
});

test("data igual desempata pelo id composto, e o tipo vem nele", () => {
  const mesmo = "2026-01-01T10:00:00.000Z";
  const login = item("LOGIN", "z", mesmo);
  const cadastro = item("CADASTRO", "a", mesmo);
  // "CADASTRO:a" < "LOGIN:z"
  assert.ok(compareActivity(cadastro, login) < 0);
});

test("a ordenação é estável sob entrada embaralhada", () => {
  const mesmo = "2026-01-01T10:00:00.000Z";
  const a = item("LOGIN", "a", mesmo);
  const b = item("LOGIN", "b", mesmo);
  const c = item("LOGIN", "c", mesmo);
  assert.deepEqual([c, a, b].sort(compareActivity), [a, b, c]);
  assert.deepEqual([b, c, a].sort(compareActivity), [a, b, c]);
});

test("isAfterCursor: data mais antiga vem depois na ordem decrescente", () => {
  const cursor = { occurredAt: "2026-02-01T10:00:00.000Z", id: "LOGIN:b" };
  assert.equal(isAfterCursor(item("LOGIN", "a", "2026-01-01T10:00:00.000Z"), cursor), true);
  assert.equal(isAfterCursor(item("LOGIN", "c", "2026-03-01T10:00:00.000Z"), cursor), false);
});

test("isAfterCursor: no mesmo instante, decide o id — e o próprio cursor fica fora", () => {
  const mesmo = "2026-02-01T10:00:00.000Z";
  const cursor = { occurredAt: mesmo, id: "LOGIN:b" };
  assert.equal(isAfterCursor(item("LOGIN", "c", mesmo), cursor), true);
  assert.equal(isAfterCursor(item("LOGIN", "a", mesmo), cursor), false);
  // O cursor é o último item JÁ exibido: não pode voltar.
  assert.equal(isAfterCursor(item("LOGIN", "b", mesmo), cursor), false);
});

test("empate de milissegundo na virada de página não perde nem repete evento", () => {
  // Três eventos no MESMO instante, página de 2: o do meio é a virada.
  const mesmo = "2026-02-01T10:00:00.000Z";
  const a = item("LOGIN", "a", mesmo);
  const b = item("LOGIN", "b", mesmo);
  const c = item("LOGIN", "c", mesmo);

  const p1 = mergeActivity([[a, b, c]], null, 2);
  assert.deepEqual(p1.events.map((e) => e.id), ["LOGIN:a", "LOGIN:b"]);
  assert.deepEqual(p1.nextCursor, { occurredAt: mesmo, id: "LOGIN:b" });

  const p2 = mergeActivity([[a, b, c]], p1.nextCursor, 2);
  assert.deepEqual(p2.events.map((e) => e.id), ["LOGIN:c"]);
  assert.equal(p2.nextCursor, null);

  // Nenhum id apareceu duas vezes, e nenhum ficou de fora.
  const vistos = [...p1.events, ...p2.events].map((e) => e.id);
  assert.deepEqual([...new Set(vistos)].sort(), ["LOGIN:a", "LOGIN:b", "LOGIN:c"]);
});

test("a fusão junta fontes diferentes numa ordem só", () => {
  const logins = [item("LOGIN", "l1", "2026-03-01T10:00:00.000Z")];
  const videos = [item("VIDEO_ASSISTIDO", "v1", "2026-02-01T10:00:00.000Z")];
  const cadastro = [item("CADASTRO", "u1", "2026-01-01T10:00:00.000Z")];

  const out = mergeActivity([logins, videos, cadastro], null, 10);
  assert.deepEqual(out.events.map((e) => e.kind), [
    "LOGIN",
    "VIDEO_ASSISTIDO",
    "CADASTRO",
  ]);
  assert.equal(out.nextCursor, null);
});

test("mais eventos que a página devolvem cursor; a última página devolve nulo", () => {
  const muitos = Array.from({ length: 5 }, (_, i) =>
    item("LOGIN", `l${i}`, `2026-01-0${i + 1}T10:00:00.000Z`),
  );
  const p1 = mergeActivity([muitos], null, 3);
  assert.equal(p1.events.length, 3);
  assert.ok(p1.nextCursor);

  const p2 = mergeActivity([muitos], p1.nextCursor, 3);
  assert.equal(p2.events.length, 2);
  assert.equal(p2.nextCursor, null);
});

test("página cheia com as fontes esgotadas não promete mais uma página", () => {
  // Exatamente 3 eventos, página de 3: não há quarto, o cursor tem de ser nulo.
  const tres = Array.from({ length: 3 }, (_, i) =>
    item("LOGIN", `l${i}`, `2026-01-0${i + 1}T10:00:00.000Z`),
  );
  const out = mergeActivity([tres], null, 3);
  assert.equal(out.events.length, 3);
  assert.equal(out.nextCursor, null);
});

test("nenhum evento não quebra", () => {
  const out = mergeActivity([[], [], []], null, 10);
  assert.deepEqual(out.events, []);
  assert.equal(out.nextCursor, null);
});

test("a página tem 30 eventos", () => {
  assert.equal(ACTIVITY_PAGE_SIZE, 30);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx tsx --test "src/lib/activity-timeline.test.ts"`
Expected: FAIL — `Cannot find module './activity-timeline'`.

- [ ] **Step 3: Implementar o núcleo**

Criar `src/lib/activity-timeline.ts`:

```ts
/**
 * A linha do tempo de atividade do colaborador: ordem, cursor e fusão.
 *
 * Nove fontes, uma página. Oito são derivadas de tabelas que já existem
 * (`ContentProgress`, `VideoComprehension`, `Ticket`…) e uma é a tabela nova
 * `ActivityEvent`, que só guarda login e logout. Aqui não há Prisma: as listas
 * chegam prontas, e o que este módulo decide é a ORDEM e o CORTE — que é onde
 * mora o risco, e o que dá para testar sem banco.
 */

/** Os dez tipos que a linha do tempo exibe. */
export type ActivityKind =
  | "CADASTRO"
  | "LOGIN"
  | "LOGOUT"
  | "VIDEO_ASSISTIDO"
  | "RESPOSTA_COMPREENSAO"
  | "AVALIACAO_VIDEO"
  | "AVALIACAO_DESIGNADA"
  | "AVALIACAO_ABERTA"
  | "AVALIACAO_RESPONDIDA"
  | "CHAMADO_ABERTO";

export interface ActivityItem {
  /**
   * Único na linha do tempo inteira, não só na tabela de origem: `TIPO:id`.
   * Ver `activityId` — o formato não é cosmético, é o desempate da ordem.
   */
  id: string;
  kind: ActivityKind;
  occurredAt: Date;
  /** Texto principal da linha, já montado. */
  title: string;
  /** Complemento, quando o evento tem o que acrescentar. */
  detail?: string;
}

/**
 * O ponto exato onde a página anterior parou.
 *
 * O par, e não só a data: duas escritas da mesma transação caem no mesmo
 * milissegundo, e um cursor de data sozinho não sabe qual das duas já foi
 * exibida — ou perde uma, ou repete.
 */
export interface ActivityCursor {
  /** ISO 8601. */
  occurredAt: string;
  id: string;
}

/** Eventos por página. */
export const ACTIVITY_PAGE_SIZE = 30;

/**
 * Id da linha do tempo: o TIPO como prefixo do id de origem.
 *
 * Não é só para evitar colisão entre tabelas. Como o tipo vem primeiro,
 * comparar dois ids como texto já ordena por tipo e depois por id — então o
 * comparador e o cursor usam UMA regra, e não duas que podem divergir.
 */
export function activityId(kind: ActivityKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

/** Ordem total: mais recente primeiro; empate no instante decide pelo id. */
export function compareActivity(a: ActivityItem, b: ActivityItem): number {
  const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Este evento vem DEPOIS do cursor na ordem total?
 *
 * "Depois" numa lista decrescente é mais antigo. O próprio cursor responde
 * falso: ele é o último item já exibido.
 */
export function isAfterCursor(item: ActivityItem, cursor: ActivityCursor): boolean {
  const cursorTime = new Date(cursor.occurredAt).getTime();
  const time = item.occurredAt.getTime();
  if (time !== cursorTime) return time < cursorTime;
  return item.id > cursor.id;
}

/**
 * Funde as fontes numa página.
 *
 * O "tem mais uma página?" é demonstrável e não um chute, mas depende de quem
 * chama: cada consulta tem de pedir `pageSize + 1` linhas. Se a fusão devolver
 * mais que `pageSize`, sobrou evento e há cursor. Se devolver `pageSize` ou
 * menos, então NENHUMA fonte chegou ao teto que pediu, logo todas se
 * esgotaram e não há mais nada — é por isso que uma página cheia pode
 * terminar com cursor nulo sem mentir.
 */
export function mergeActivity(
  sources: readonly (readonly ActivityItem[])[],
  cursor?: ActivityCursor | null,
  pageSize: number = ACTIVITY_PAGE_SIZE,
): { events: ActivityItem[]; nextCursor: ActivityCursor | null } {
  const merged = sources
    .flat()
    .filter((item) => !cursor || isAfterCursor(item, cursor))
    .sort(compareActivity);

  const events = merged.slice(0, pageSize);
  const last = events[events.length - 1];
  const nextCursor =
    merged.length > pageSize && last
      ? { occurredAt: last.occurredAt.toISOString(), id: last.id }
      : null;

  return { events, nextCursor };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx tsx --test "src/lib/activity-timeline.test.ts"`
Expected: PASS, 12 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, nenhuma regressão.

- [ ] **Step 6: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/lib/activity-timeline.ts src/lib/activity-timeline.test.ts
git commit -m "$(cat <<'EOF'
Atividade: a ordem, o cursor e a fusão das nove fontes

Ordenar nove listas por data não basta. Duas escritas da mesma transação
caem no mesmo milissegundo, e um cursor de data sozinho não sabe qual das
duas já foi exibida — ou perde uma, ou repete.

Daí o id composto `TIPO:id`: como o tipo vem primeiro, comparar ids como
texto já ordena por tipo e depois por id, então o comparador e o cursor
usam UMA regra em vez de duas que podem divergir.

O "tem mais uma página?" é demonstrável, não chute: cada consulta pede
uma linha além da página. Se a fusão devolve mais que o tamanho da
página, sobrou evento. Se devolve o tamanho exato ou menos, nenhuma fonte
chegou ao teto que pediu, logo todas se esgotaram — é o que deixa uma
página cheia terminar sem cursor sem mentir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: As nove consultas e o mapeamento

**Files:**
- Create: `src/lib/activity-timeline-data.ts`
- Test: `src/lib/activity-timeline-data.dbtest.ts`

**Interfaces:**
- Consumes: `ActivityItem`, `ActivityCursor`, `ACTIVITY_PAGE_SIZE`, `activityId`, `mergeActivity` (Task 3); `dateLabelBR` de `@/lib/brasilia`.
- Produces: `getActivityPage(input: { userId: string; cursor?: ActivityCursor | null }): Promise<{ events: ActivityItem[]; nextCursor: ActivityCursor | null }>`

**Nota sobre rótulos:** a spec §5 previa um `dateTimeLabelBR` novo. Não é
necessário: a tela agrupa por dia e mostra só a hora na linha, e
[brasilia.ts](../../../src/lib/brasilia.ts) já tem `isoDateBR`, `dateLabelBR` e
`timeLabelBR`. O módulo não tem import de servidor, então o componente cliente
importa os três direto. Um quarto rótulo seria código sem consumidor.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/activity-timeline-data.dbtest.ts`:

```ts
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getActivityPage } from "./activity-timeline-data";

/**
 * As nove origens contra o Postgres: cada uma tem de virar o evento certo,
 * com a data certa, e nenhuma pode virar um evento que não é o seu.
 *
 * O caso que mais importa está no teste do documento: `ContentProgress` serve
 * vídeo E documento, e `endedAt` é nulo nos documentos. Sem o filtro certo,
 * documento lido viraria "vídeo assistido".
 */

const MARK = "#ACTTL";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let subsectorId = "";
let videoId = "";
let documentId = "";
let typeId = "";
let sectionId = "";
let userId = "";
let outroId = "";

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `acttl-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = s.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `acttlsub-${stamp()}`,
      label: `Sub ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 1,
      sectorId,
    },
    select: { id: true },
  });
  subsectorId = sub.id;

  const video = await prisma.video.create({
    data: {
      title: `Vídeo ${MARK}`,
      kind: "INSTRUCAO",
      subsectorId,
      filePath: "/uploads/acttl.mp4",
    },
    select: { id: true },
  });
  videoId = video.id;

  const doc = await prisma.document.create({
    data: {
      name: `Manual ${MARK}`,
      kind: "PDF",
      sizeBytes: 10,
      filePath: "/uploads/acttl.pdf",
      subsectorId,
    },
    select: { id: true },
  });
  documentId = doc.id;

  const u = await prisma.user.create({
    data: {
      username: `acttl-${stamp()}${MARK}`,
      fullName: `Ativo ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  userId = u.id;

  const o = await prisma.user.create({
    data: {
      username: `acttlo-${stamp()}${MARK}`,
      fullName: `Outro ${MARK}`,
      passwordHash: "x",
      role: "GESTOR",
      sectorId,
    },
    select: { id: true },
  });
  outroId = o.id;

  // LOGIN gravado.
  await prisma.activityEvent.create({ data: { userId, kind: "LOGIN" } });

  // Vídeo assistido: endedAt preenchido.
  await prisma.contentProgress.create({
    data: { userId, videoId, completed: true, endedAt: new Date() },
  });
  // Documento lido: endedAt NULO, por definição do schema.
  await prisma.contentProgress.create({
    data: { userId, documentId, completed: true, endedAt: null },
  });

  await prisma.videoComprehension.create({
    data: { userId, videoId, answer: "resposta", attempt: 1 },
  });
  await prisma.videoRating.create({
    data: { userId, videoId, audio: 5, image: 4, clarity: 5 },
  });

  const type = await prisma.evaluationType.create({
    data: {
      slug: `acttl-${stamp()}`,
      kind: "EFICACIA",
      title: `Eficácia ${MARK}`,
      scaleMax: 5,
      order: 999,
    },
    select: { id: true },
  });
  typeId = type.id;

  const section = await prisma.evaluationSection.create({
    data: { typeId, title: `Seção ${MARK}`, order: 1 },
    select: { id: true },
  });
  sectionId = section.id;

  // Rodada aberta SOBRE o usuário.
  const round = await prisma.evaluationRound.create({
    data: { typeId, subjectId: userId },
    select: { id: true },
  });
  // O usuário designado PARA AVALIAR outra pessoa.
  const outraRodada = await prisma.evaluationRound.create({
    data: { typeId, subjectId: outroId },
    select: { id: true },
  });
  await prisma.evaluationAssignment.create({
    data: { roundId: outraRodada.id, raterId: userId },
  });

  // O usuário respondeu uma avaliação.
  await prisma.evaluation.create({
    data: {
      typeId,
      subjectId: outroId,
      evaluatorId: userId,
      roundId: outraRodada.id,
      status: "CONCLUIDA",
      total: 7,
    },
  });

  // Chamado aberto por ele.
  await prisma.ticket.create({
    data: {
      code: `T-${stamp()}`,
      destination: "TI",
      title: `Chamado ${MARK}`,
      requesterId: userId,
    },
  });

  void round;
});

after(async () => {
  const ids = [userId, outroId];
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } });
  await prisma.evaluation.deleteMany({ where: { typeId } });
  await prisma.evaluationAssignment.deleteMany({ where: { raterId: { in: ids } } });
  await prisma.evaluationRound.deleteMany({ where: { typeId } });
  await prisma.evaluationSection.deleteMany({ where: { id: sectionId } });
  await prisma.evaluationType.deleteMany({ where: { id: typeId } });
  await prisma.videoRating.deleteMany({ where: { userId: { in: ids } } });
  await prisma.videoComprehension.deleteMany({ where: { userId: { in: ids } } });
  await prisma.contentProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.activityEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.document.deleteMany({ where: { subsectorId } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("documento lido NÃO vira vídeo assistido", async () => {
  const { events } = await getActivityPage({ userId });
  const assistidos = events.filter((e) => e.kind === "VIDEO_ASSISTIDO");
  assert.equal(assistidos.length, 1);
  assert.ok(assistidos[0]?.title.includes("Vídeo"));
  assert.ok(!assistidos.some((e) => e.title.includes("Manual")));
});

test("as nove origens aparecem, cada uma no seu tipo", async () => {
  const { events } = await getActivityPage({ userId });
  const kinds = new Set(events.map((e) => e.kind));
  for (const esperado of [
    "CADASTRO",
    "LOGIN",
    "VIDEO_ASSISTIDO",
    "RESPOSTA_COMPREENSAO",
    "AVALIACAO_VIDEO",
    "AVALIACAO_DESIGNADA",
    "AVALIACAO_ABERTA",
    "AVALIACAO_RESPONDIDA",
    "CHAMADO_ABERTO",
  ]) {
    assert.ok(kinds.has(esperado as never), `faltou ${esperado}`);
  }
});

test("o cadastro é sempre o evento mais antigo", async () => {
  const { events } = await getActivityPage({ userId });
  assert.equal(events[events.length - 1]?.kind, "CADASTRO");
});

test("os eventos vêm do mais recente para o mais antigo", async () => {
  const { events } = await getActivityPage({ userId });
  for (let i = 1; i < events.length; i += 1) {
    const anterior = events[i - 1];
    const atual = events[i];
    assert.ok(anterior && atual);
    assert.ok(
      anterior.occurredAt.getTime() >= atual.occurredAt.getTime(),
      `evento ${i} está fora de ordem`,
    );
  }
});

test("a atividade de uma pessoa não vaza para a de outra", async () => {
  const { events } = await getActivityPage({ userId: outroId });
  // O outro só tem cadastro e a rodada aberta sobre ele.
  assert.ok(!events.some((e) => e.kind === "LOGIN"));
  assert.ok(!events.some((e) => e.kind === "CHAMADO_ABERTO"));
});

test("chamado leva o código no texto", async () => {
  const { events } = await getActivityPage({ userId });
  const chamado = events.find((e) => e.kind === "CHAMADO_ABERTO");
  assert.ok(chamado?.detail?.includes("Chamado"));
});

test("designado para avaliar e avaliação aberta sobre ele são eventos distintos", async () => {
  const { events } = await getActivityPage({ userId });
  const designada = events.find((e) => e.kind === "AVALIACAO_DESIGNADA");
  const aberta = events.find((e) => e.kind === "AVALIACAO_ABERTA");
  assert.ok(designada && aberta);
  assert.notEqual(designada.id, aberta.id);
});

test("avaliador removido do cadastro não quebra o evento", async () => {
  // Zera o avaliador (é o que `onDelete: SetNull` faz ao excluir o usuário).
  await prisma.evaluation.updateMany({ where: { typeId }, data: { evaluatorId: null } });
  const { events } = await getActivityPage({ userId: outroId });
  const respondida = events.find((e) => e.kind === "AVALIACAO_RESPONDIDA");
  // O usuário não é mais o avaliador, então o evento sai da linha DELE.
  assert.equal(respondida, undefined);

  const dele = await getActivityPage({ userId });
  assert.ok(!dele.events.some((e) => e.kind === "AVALIACAO_RESPONDIDA"));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx --test --test-concurrency=1 "src/lib/activity-timeline-data.dbtest.ts"`
Expected: FAIL — `Cannot find module './activity-timeline-data'`.

- [ ] **Step 3: Implementar o cabeçalho e o helper de janela**

Criar `src/lib/activity-timeline-data.ts` com:

```ts
import { prisma } from "@/lib/db/prisma";
import {
  ACTIVITY_PAGE_SIZE,
  activityId,
  mergeActivity,
  type ActivityCursor,
  type ActivityItem,
} from "@/lib/activity-timeline";

/**
 * As nove consultas da linha do tempo, e o texto de cada evento.
 *
 * Oito origens são derivadas de tabelas que já existem; a nona é
 * `ActivityEvent`, com login e logout. Todas pedem UMA LINHA ALÉM da página
 * (`TAKE`): é o que permite a `mergeActivity` saber, sem chutar, se sobrou
 * evento — ver o comentário dela.
 *
 * Os textos são montados aqui, e não na tela: é do lado do servidor que estão
 * os títulos de vídeo, os códigos de chamado e os nomes, e mandá-los como
 * frase pronta evita o componente ter de saber o que é uma rodada de Eficácia.
 */
const TAKE = ACTIVITY_PAGE_SIZE + 1;

/**
 * Teto de data das consultas. Sem cursor, não há teto.
 *
 * `lte` e não `lt`: o evento empatado no milissegundo exato do cursor tem de
 * VOLTAR na consulta para a fusão poder decidir se ele já foi exibido. Cortar
 * com `lt` no banco o perderia antes de alguém olhar.
 */
function ceiling(cursor?: ActivityCursor | null) {
  return cursor ? { lte: new Date(cursor.occurredAt) } : undefined;
}
```

- [ ] **Step 4: Implementar a função de leitura — parte 1, as consultas**

No mesmo arquivo, acrescentar:

```ts
export async function getActivityPage(input: {
  userId: string;
  cursor?: ActivityCursor | null;
}): Promise<{ events: ActivityItem[]; nextCursor: ActivityCursor | null }> {
  const { userId, cursor } = input;
  const window = ceiling(cursor);

  const [
    user,
    logged,
    watched,
    comprehensions,
    ratings,
    assignments,
    rounds,
    evaluations,
    tickets,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, occurredAt: window },
      orderBy: { occurredAt: "desc" },
      take: TAKE,
      select: { id: true, kind: true, occurredAt: true },
    }),
    /*
     * Vídeo assistido. Os dois filtros são necessários: `ContentProgress`
     * serve vídeo E documento, e `endedAt` é nulo nos documentos por definição
     * do schema. Sem eles, documento lido viraria "vídeo assistido" sem data.
     */
    prisma.contentProgress.findMany({
      where: { userId, videoId: { not: null }, endedAt: { not: null, ...window } },
      orderBy: { endedAt: "desc" },
      take: TAKE,
      select: { id: true, endedAt: true, video: { select: { title: true } } },
    }),
    prisma.videoComprehension.findMany({
      where: { userId, submittedAt: window },
      orderBy: { submittedAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        submittedAt: true,
        attempt: true,
        video: { select: { title: true } },
      },
    }),
    prisma.videoRating.findMany({
      where: { userId, createdAt: window },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, createdAt: true, video: { select: { title: true } } },
    }),
    // Designado para AVALIAR outra pessoa.
    prisma.evaluationAssignment.findMany({
      where: { raterId: userId, createdAt: window },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        createdAt: true,
        round: {
          select: { type: { select: { title: true } }, subject: { select: { fullName: true } } },
        },
      },
    }),
    // Avaliação ABERTA SOBRE ele.
    prisma.evaluationRound.findMany({
      where: { subjectId: userId, createdAt: window },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, createdAt: true, type: { select: { title: true } } },
    }),
    // Avaliação que ELE respondeu. `evaluatorId` cobre a autoavaliação também:
    // no autopreenchimento, quem responde é o próprio sujeito.
    prisma.evaluation.findMany({
      where: { evaluatorId: userId, status: "CONCLUIDA", createdAt: window },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        createdAt: true,
        cycle: true,
        total: true,
        isSelfAssessment: true,
        type: { select: { title: true } },
        subject: { select: { fullName: true } },
      },
    }),
    prisma.ticket.findMany({
      where: { requesterId: userId, createdAt: window },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, code: true, title: true, destination: true, createdAt: true },
    }),
  ]);

  if (!user) return { events: [], nextCursor: null };
```

- [ ] **Step 5: Implementar a função de leitura — parte 2, o mapeamento**

Continuar na mesma função:

```ts
  // O cadastro é uma linha só, não uma consulta paginada: uma pessoa tem uma
  // data de cadastro, e ela é sempre o evento mais antigo da linha do tempo.
  const cadastro: ActivityItem[] = [
    {
      id: activityId("CADASTRO", user.id),
      kind: "CADASTRO",
      occurredAt: user.createdAt,
      title: "Cadastro criado",
    },
  ];

  const sessoes: ActivityItem[] = logged.map((row) => ({
    id: activityId(row.kind, row.id),
    kind: row.kind,
    occurredAt: row.occurredAt,
    title: row.kind === "LOGIN" ? "Entrou na plataforma" : "Saiu da plataforma",
  }));

  const assistidos: ActivityItem[] = watched.map((row) => ({
    id: activityId("VIDEO_ASSISTIDO", row.id),
    kind: "VIDEO_ASSISTIDO",
    // O filtro da consulta garante não nulo; o tipo gerado não sabe disso.
    occurredAt: row.endedAt as Date,
    title: "Assistiu ao vídeo",
    detail: row.video?.title,
  }));

  const respostas: ActivityItem[] = comprehensions.map((row) => ({
    id: activityId("RESPOSTA_COMPREENSAO", row.id),
    kind: "RESPOSTA_COMPREENSAO",
    occurredAt: row.submittedAt,
    title: "Respondeu à compreensão do vídeo",
    // Tentativa só a partir da 2ª: marcar "tentativa 1" em todo registro
    // seria ruído, como já se faz no card de Meu Setor.
    detail:
      row.attempt > 1 ? `${row.video.title} · tentativa ${row.attempt}` : row.video.title,
  }));

  const avaliacoesVideo: ActivityItem[] = ratings.map((row) => ({
    id: activityId("AVALIACAO_VIDEO", row.id),
    kind: "AVALIACAO_VIDEO",
    occurredAt: row.createdAt,
    title: "Avaliou a qualidade do vídeo",
    detail: row.video.title,
  }));

  const designadas: ActivityItem[] = assignments.map((row) => ({
    id: activityId("AVALIACAO_DESIGNADA", row.id),
    kind: "AVALIACAO_DESIGNADA",
    occurredAt: row.createdAt,
    title: "Designado para avaliar",
    detail: `${row.round.type.title} · ${row.round.subject.fullName}`,
  }));

  const abertas: ActivityItem[] = rounds.map((row) => ({
    id: activityId("AVALIACAO_ABERTA", row.id),
    kind: "AVALIACAO_ABERTA",
    occurredAt: row.createdAt,
    title: "Avaliação aberta sobre ele",
    detail: row.type.title,
  }));

  const respondidas: ActivityItem[] = evaluations.map((row) => {
    const partes = [row.type.title];
    if (row.cycle !== null) partes.push(`ciclo ${row.cycle}`);
    if (row.total !== null) partes.push(`${row.total} pontos`);
    // Sujeito removido do cadastro deixa o vínculo nulo: a avaliação continua
    // valendo, sem o nome.
    if (!row.isSelfAssessment) partes.push(row.subject?.fullName ?? "—");
    return {
      id: activityId("AVALIACAO_RESPONDIDA", row.id),
      kind: "AVALIACAO_RESPONDIDA",
      occurredAt: row.createdAt,
      title: row.isSelfAssessment ? "Respondeu à autoavaliação" : "Respondeu a uma avaliação",
      detail: partes.join(" · "),
    };
  });

  const chamados: ActivityItem[] = tickets.map((row) => ({
    id: activityId("CHAMADO_ABERTO", row.id),
    kind: "CHAMADO_ABERTO",
    occurredAt: row.createdAt,
    title: `Abriu chamado ${row.code}`,
    detail: `${row.title} · ${row.destination === "TI" ? "TI" : "Motoristas"}`,
  }));

  return mergeActivity(
    [
      cadastro,
      sessoes,
      assistidos,
      respostas,
      avaliacoesVideo,
      designadas,
      abertas,
      respondidas,
      chamados,
    ],
    cursor,
  );
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx tsx --test --test-concurrency=1 "src/lib/activity-timeline-data.dbtest.ts"`
Expected: PASS, 8 testes.

- [ ] **Step 7: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 8: Commit**

```bash
git add src/lib/activity-timeline-data.ts src/lib/activity-timeline-data.dbtest.ts
git commit -m "$(cat <<'EOF'
Atividade: as nove consultas e o texto de cada evento

A armadilha está no vídeo assistido: `ContentProgress` serve vídeo E
documento, e `endedAt` é nulo nos documentos por definição do schema. Sem
filtrar os dois campos, documento lido viraria "vídeo assistido" sem
data — e o teste que trava isso é o primeiro do arquivo.

A janela das consultas usa `lte`, não `lt`: o evento empatado no
milissegundo exato do cursor tem de voltar na consulta para a fusão poder
decidir se ele já foi exibido. Cortar no banco o perderia antes.

Designado para avaliar e avaliação aberta sobre ele são eventos
distintos, porque o modelo separa os dois papéis e fundi-los diria "houve
uma avaliação" sem dizer de que lado a pessoa estava.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Server Action e a primeira página junto do histórico

**Files:**
- Create: `src/lib/activity-timeline-actions.ts`
- Modify: `src/types/hr.ts` (interface `EmployeeHistory`)
- Modify: `src/lib/hr-history-data.ts` (função `getEmployeeHistory`)
- Test: `src/lib/activity-timeline-actions.dbtest.ts`

**Interfaces:**
- Consumes: `getActivityPage` (Task 4); `requireDhoAdmin` — **hoje é privada** em `hr-actions-history.ts` e precisa ser exportada.
- Produces:
  - `fetchActivityPage(input: { userId: string; cursor?: ActivityCursor | null }): Promise<{ ok: boolean; events?: ActivityItem[]; nextCursor?: ActivityCursor | null; error?: string }>`
  - `EmployeeHistory.activity: { events: ActivityItem[]; nextCursor: ActivityCursor | null }`

- [ ] **Step 1: Exportar o portão de permissão**

Em `src/lib/hr-actions-history.ts`, trocar a assinatura de `requireDhoAdmin` para exportá-la (o corpo não muda):

```ts
/**
 * Mesma régua das actions do módulo: quem administra o DHO — Admin, ou Gestor
 * lotado no DHO. Devolve o motivo da recusa, ou null quando pode seguir.
 *
 * Exportada porque a linha do tempo de atividade é do mesmo módulo e tem de
 * passar pela MESMA porta: uma segunda cópia da regra seria uma segunda porta
 * para fechar no dia em que ela mudar.
 */
export async function requireDhoAdmin(): Promise<string | null> {
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `src/lib/activity-timeline-actions.dbtest.ts`:

```ts
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getEmployeeHistory } from "./hr-history-data";

/**
 * A primeira página da linha do tempo chega junto do histórico.
 *
 * Existe porque a alternativa pisca: abrir um colaborador e só então disparar
 * uma segunda ida ao servidor deixaria o bloco vazio a cada seleção.
 *
 * O caso do recém-cadastrado é o que trava o outro extremo: uma linha só,
 * sem cursor, sem botão de carregar mais.
 */

const MARK = "#ACTACT";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let novatoId = "";

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `actact-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = s.id;

  const u = await prisma.user.create({
    data: {
      username: `actact-${stamp()}${MARK}`,
      fullName: `Novato ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  novatoId = u.id;
});

after(async () => {
  await prisma.activityEvent.deleteMany({ where: { userId: novatoId } });
  await prisma.user.deleteMany({ where: { id: novatoId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("o histórico já vem com a primeira página da atividade", async () => {
  const history = await getEmployeeHistory(novatoId);
  assert.ok(history);
  assert.ok(Array.isArray(history.activity.events));
});

test("recém-cadastrado tem uma linha só: o cadastro, e nenhum cursor", async () => {
  const history = await getEmployeeHistory(novatoId);
  assert.ok(history);
  assert.equal(history.activity.events.length, 1);
  assert.equal(history.activity.events[0]?.kind, "CADASTRO");
  assert.equal(history.activity.nextCursor, null);
});

test("um login novo entra na frente do cadastro", async () => {
  await prisma.activityEvent.create({ data: { userId: novatoId, kind: "LOGIN" } });
  const history = await getEmployeeHistory(novatoId);
  assert.ok(history);
  assert.equal(history.activity.events.length, 2);
  assert.equal(history.activity.events[0]?.kind, "LOGIN");
  assert.equal(history.activity.events[1]?.kind, "CADASTRO");
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx tsx --test --test-concurrency=1 "src/lib/activity-timeline-actions.dbtest.ts"`
Expected: FAIL — `history.activity` é `undefined`.

- [ ] **Step 4: Levar a primeira página ao tipo e ao agregador**

Em `src/types/hr.ts`, acrescentar ao topo:

```ts
import type { ActivityCursor, ActivityItem } from "@/lib/activity-timeline";
```

E em `EmployeeHistory`, depois de `rejections`:

```ts
  /**
   * Primeira página da linha do tempo, já resolvida.
   *
   * Vem junto do histórico, e não numa segunda chamada: disparar outra ida ao
   * servidor ao selecionar um colaborador deixaria o bloco piscando vazio a
   * cada troca de seleção.
   */
  activity: { events: ActivityItem[]; nextCursor: ActivityCursor | null };
```

Em `src/lib/hr-history-data.ts`, acrescentar ao bloco de imports:

```ts
import { getActivityPage } from "@/lib/activity-timeline-data";
```

Acrescentar a chamada logo antes do `return` da função `getEmployeeHistory`:

```ts
  const activity = await getActivityPage({ userId });
```

E o campo no objeto devolvido, depois de `rejections`:

```ts
    activity,
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx tsx --test --test-concurrency=1 "src/lib/activity-timeline-actions.dbtest.ts"`
Expected: PASS, 3 testes.

- [ ] **Step 6: Escrever a Server Action**

Criar `src/lib/activity-timeline-actions.ts`:

```ts
"use server";

import { z } from "zod";
import { requireDhoAdmin } from "@/lib/hr-actions-history";
import { getActivityPage } from "@/lib/activity-timeline-data";
import type { ActivityCursor, ActivityItem } from "@/lib/activity-timeline";

export interface ActivityPageResult {
  ok: boolean;
  events?: ActivityItem[];
  nextCursor?: ActivityCursor | null;
  error?: string;
}

const schema = z.object({
  userId: z.string().min(1),
  cursor: z
    .object({ occurredAt: z.string().datetime(), id: z.string().min(1) })
    .nullish(),
});

/**
 * Próxima página da linha do tempo de um colaborador ("carregar mais").
 *
 * O cursor vem do cliente, então é validado como qualquer entrada: uma data
 * que não é data viraria `Invalid Date` e a janela da consulta pararia de
 * filtrar, devolvendo a linha do tempo inteira. A permissão é revalidada aqui
 * — a tela ter escondido o bloco não é a trava.
 */
export async function fetchActivityPage(input: {
  userId: string;
  cursor?: ActivityCursor | null;
}): Promise<ActivityPageResult> {
  const denied = await requireDhoAdmin();
  if (denied) return { ok: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Consulta inválida." };

  const page = await getActivityPage({
    userId: parsed.data.userId,
    cursor: parsed.data.cursor ?? null,
  });
  return { ok: true, events: page.events, nextCursor: page.nextCursor };
}
```

- [ ] **Step 7: Typecheck, lint e suíte inteira**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sem erro; nenhuma regressão nos 277+ testes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/activity-timeline-actions.ts src/lib/activity-timeline-actions.dbtest.ts src/types/hr.ts src/lib/hr-history-data.ts src/lib/hr-actions-history.ts
git commit -m "$(cat <<'EOF'
Atividade: a primeira página vem com o histórico, o resto sob demanda

Selecionar um colaborador e só então buscar a atividade deixaria o bloco
piscando vazio a cada troca. A primeira página vem junto; "carregar mais"
chama a Server Action com o cursor.

O cursor é entrada do cliente e é validado como tal: uma data que não é
data viraria `Invalid Date`, a janela da consulta pararia de filtrar e a
linha do tempo inteira voltaria de uma vez.

`requireDhoAdmin` foi exportada em vez de copiada. A linha do tempo é do
mesmo módulo e passa pela mesma porta — uma segunda cópia da regra seria
uma segunda porta para fechar no dia em que ela mudar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: O bloco na tela, ao lado da Média

**Files:**
- Create: `src/components/hr/activity-timeline.tsx`
- Modify: `src/components/hr/employee-history.tsx` (a seção "Média", hoje um bloco solto)

**Interfaces:**
- Consumes: `ActivityItem`, `ActivityCursor` (Task 3); `fetchActivityPage` (Task 5); `isoDateBR`, `dateLabelBR`, `timeLabelBR` de `@/lib/brasilia`.
- Produces: `<ActivityTimeline userId history={...} />` — componente cliente.

- [ ] **Step 1: Escrever o componente**

Criar `src/components/hr/activity-timeline.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  CircleUser,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  LifeBuoy,
  LogIn,
  LogOut,
  PlayCircle,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { dateLabelBR, isoDateBR, timeLabelBR } from "@/lib/brasilia";
import { fetchActivityPage } from "@/lib/activity-timeline-actions";
import type { ActivityCursor, ActivityItem, ActivityKind } from "@/lib/activity-timeline";

/** Ícone por tipo de evento. */
const ICON: Record<ActivityKind, LucideIcon> = {
  CADASTRO: UserPlus,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  VIDEO_ASSISTIDO: PlayCircle,
  RESPOSTA_COMPREENSAO: FileQuestion,
  AVALIACAO_VIDEO: Star,
  AVALIACAO_DESIGNADA: ClipboardList,
  AVALIACAO_ABERTA: CircleUser,
  AVALIACAO_RESPONDIDA: ClipboardCheck,
  CHAMADO_ABERTO: LifeBuoy,
};

/** Data em que a plataforma passou a registrar entrada e saída. */
const SESSION_LOG_SINCE = "25/09/2026";

interface Day {
  key: string;
  label: string;
  items: ActivityItem[];
}

/**
 * Agrupa por dia de calendário em Brasília, preservando a ordem recebida.
 *
 * O agrupamento é feito aqui e não no servidor porque depende só da data que
 * já veio: mandar o rótulo do dia repetido em cada evento seria enviar a mesma
 * string trinta vezes.
 */
function byDay(events: readonly ActivityItem[]): Day[] {
  const days: Day[] = [];
  for (const item of events) {
    const key = isoDateBR(item.occurredAt);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, label: dateLabelBR(item.occurredAt), items: [item] });
  }
  return days;
}

/**
 * Linha do tempo do colaborador.
 *
 * Paginada por cursor, com botão em vez de rolagem infinita: o DHO costuma
 * procurar um evento específico, e rolagem infinita tira dele o controle de
 * onde parou.
 */
export function ActivityTimeline({
  userId,
  initial,
}: {
  userId: string;
  initial: { events: ActivityItem[]; nextCursor: ActivityCursor | null };
}) {
  const [events, setEvents] = useState<ActivityItem[]>(initial.events);
  const [cursor, setCursor] = useState<ActivityCursor | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Trocar de colaborador reinicia a lista. Sem isto, a atividade da pessoa
   * anterior continuaria na tela sob o nome da nova — o componente não é
   * remontado, porque a posição dele na árvore não muda.
   */
  useEffect(() => {
    setEvents(initial.events);
    setCursor(initial.nextCursor);
    setError(null);
  }, [initial]);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    const res = await fetchActivityPage({ userId, cursor });
    if (res.ok && res.events) {
      setEvents((current) => [...current, ...res.events!]);
      setCursor(res.nextCursor ?? null);
    } else {
      setError(res.error ?? "Não foi possível carregar mais eventos.");
    }
    setLoading(false);
  }

  const days = byDay(events);
  // O cadastro é o evento mais antigo que existe: tê-lo à vista significa que
  // a linha do tempo chegou ao início.
  const reachedStart = !cursor && events.some((e) => e.kind === "CADASTRO");

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
        <ClipboardList className="h-3 w-3" />
        Atividade
      </h3>

      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nenhuma atividade registrada.</p>
      ) : (
        <div className="scrollbar-slim max-h-[28rem] space-y-5 overflow-y-auto pr-1">
          {days.map((day) => (
            <div key={day.key}>
              <p className="mb-2 text-[11px] font-semibold text-muted">{day.label}</p>
              <ul className="space-y-3">
                {day.items.map((item) => {
                  const Icon = ICON[item.kind];
                  return (
                    <li key={item.id} className="flex gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground">{item.title}</span>
                        {item.detail && (
                          <span className="block break-words text-xs text-muted">
                            {item.detail}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted">
                        {timeLabelBR(item.occurredAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {cursor && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loading}>
            {loading ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      )}

      {/* Sem este aviso, um cadastro antigo sem nenhum LOGIN lê-se como
          "nunca acessou a plataforma". */}
      {reachedStart && (
        <p className={cn("mt-4 text-[11px] text-muted")}>
          Registros de entrada e saída existem a partir de {SESSION_LOG_SINCE}.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Pôr Atividade e Média lado a lado**

Em `src/components/hr/employee-history.tsx`, acrescentar ao bloco de imports:

```ts
import { ActivityTimeline } from "./activity-timeline";
```

Envolver o bloco "Média" que já existe numa grade com a Atividade. Substituir a
linha de abertura do comentário e da `<section>` da Média:

```tsx
            {/* Média consolidada. Fica em bloco próprio, e não entre os cartões
                de engajamento, porque não é contagem: os outros dizem QUANTO a
                pessoa consumiu, este diz QUÃO BEM ela respondeu. */}
            <section className="rounded-xl border border-border bg-surface p-5">
```

por:

```tsx
            {/* Atividade e Média lado a lado: a linha do tempo diz O QUE a
                pessoa fez, a média diz QUÃO BEM — lidas juntas, uma explica a
                outra. No celular empilham, Atividade primeiro. */}
            <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
              <ActivityTimeline userId={history.id} initial={history.activity} />

              <section className="rounded-xl border border-border bg-surface p-5">
```

E fechar a grade: a `</section>` que encerra o bloco da Média passa a ser
seguida de `</div>`:

```tsx
              </section>
            </div>
```

A indentação do conteúdo interno da `<section>` da Média sobe um nível junto.

- [ ] **Step 3: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build completo. Confere as fronteiras cliente/servidor — `fetchActivityPage` é Server Action chamada de componente cliente.

- [ ] **Step 5: Suíte completa**

Run: `npm test && npm run test:db`
Expected: PASS em tudo.

- [ ] **Step 6: Commit**

```bash
git add src/components/hr/activity-timeline.tsx src/components/hr/employee-history.tsx
git commit -m "$(cat <<'EOF'
Atividade: o bloco entra ao lado da Média

A linha do tempo diz O QUE a pessoa fez, a média diz QUÃO BEM. Lidas
lado a lado, uma explica a outra; no celular empilham, Atividade
primeiro.

Botão "carregar mais" em vez de rolagem infinita: o DHO costuma procurar
um evento específico, e rolagem infinita tira dele o controle de onde
parou.

Trocar de colaborador reinicia a lista. O componente não é remontado ao
mudar a seleção — a posição dele na árvore é a mesma — então sem o reset
a atividade da pessoa anterior continuaria na tela sob o nome da nova.

Ao alcançar o cadastro, o rodapé avisa desde quando entrada e saída são
registradas. Sem isso, um cadastro antigo sem nenhum login se leria como
"nunca acessou".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| §1 tipos de evento (10 tipos, 9 consultas) | Task 4 |
| §2 tabela `ActivityEvent` | Task 1 |
| §3 instrumentação login/logout + assimetria | Task 2 |
| §4 ordem total, cursor, paginação, contrato | Tasks 3 e 5 |
| §5 tela, agrupamento por dia, "carregar mais", aviso da assimetria | Task 6 |
| §6 testes puros e de banco | Tasks 2–5 |
| §7 permissão | Task 5, Step 1 |
| §8 ordem de implementação | Tasks 1→6 |

Dois desvios da spec, ambos deliberados e registrados no plano: `dateTimeLabelBR` não é criado (Task 4, nota — a tela agrupa por dia e usa os rótulos que já existem), e a permissão é `canAdministerDho`, não Admin-only (Global Constraints).

**2. Placeholders:** nenhum "TBD"/"TODO"/"implementar depois". Todo passo de código tem o código.

**3. Consistência de tipos:** `ActivityItem`/`ActivityCursor`/`ActivityKind`/`activityId`/`compareActivity`/`isAfterCursor`/`mergeActivity`/`ACTIVITY_PAGE_SIZE` definidos na Task 3 e usados com os mesmos nomes nas Tasks 4, 5 e 6. `getActivityPage` (Task 4) consumido na Task 5. `fetchActivityPage` (Task 5) consumido na Task 6. `recordActivity` (Task 2) só na Task 2. `requireDhoAdmin` exportada na Task 5, Step 1, antes do uso no Step 6.

**4. Review Focus:** os cinco modos de falha têm teste na task dona — `endedAt` nulo em documento (Task 4, Step 1), empate de milissegundo (Task 3, Step 1, teste "empate de milissegundo na virada de página"), logout com sessão expirada (Task 2, Step 5 — o `if (session)`, com o comportamento descrito no comentário), recém-cadastrado (Task 5, Step 2), avaliador removido (Task 4, Step 1, último teste).
