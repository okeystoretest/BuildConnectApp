# Reprovação na compreensão de vídeo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nota abaixo de 7 devolve o vídeo ao colaborador, que reassiste e responde de novo sem teto de tentativas; gestor e colaborador são avisados pelo sino; "Meu Progresso" executa o conteúdo e destaca o que foi reprovado.

**Architecture:** `VideoComprehension` deixa de ser "uma resposta por vídeo" e passa a ser "uma tentativa" (`attempt`, unique em `[userId, videoId, attempt]`). Reprovar devolve `ContentProgress` a `completed: false` e zera `endedAt`, obrigando a reassistir. Toda decisão de aviso mora em módulos puros testados sem banco; o banco só fornece números.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma 6 + PostgreSQL, React 18, Tailwind, `node:test` via `tsx`.

**Spec:** [docs/superpowers/specs/2026-09-22-reprovacao-compreensao-video-design.md](../specs/2026-09-22-reprovacao-compreensao-video-design.md)

## Global Constraints

- Nota válida: inteiro de **1 a 10**. Aprovação a partir de **7**.
- **Sem teto de tentativas.**
- **Nenhum aviso por WhatsApp** neste trabalho — só o sino (`Notification`).
- Respostas paradas entram na varredura após **3 dias**.
- Aviso ao gestor a cada **5** pendências na fila.
- Texto do aviso de reprovação, literal: `Opa! Não foi dessa vez — assista ao vídeo "{título}" novamente.`
- Mensagem da 2ª reprovação em diante, literal: `Que tal rever com calma? Assista ao vídeo de novo e responda.`
- Nenhuma função de `src/lib/notifications/notify.ts` pode lançar.
- Cor nunca é o único sinal (WCAG 1.4.1): sempre cor **e** ícone **e** texto.
- Cada commit deixa `npm run typecheck`, `npm run lint` e `npm test` verdes.
- Comentários e mensagens de commit em português, como no resto do repositório.

---

## Estrutura de arquivos

**Criar:**
- `src/lib/video-comprehension-alerts.ts` — decisão pura de quando avisar o gestor.
- `src/lib/video-comprehension-alerts.test.ts`
- `src/lib/video-comprehension.test.ts`
- `prisma/migrations/20260922100000_video_comprehension_attempts/migration.sql`
- `src/lib/video-comprehension-cycle.dbtest.ts`
- `src/components/progress/pending-item-player.tsx` — dono do `VideoModal` em /progresso.

**Modificar:**
- `src/lib/video-comprehension.ts` — constantes e predicados.
- `prisma/schema.prisma` — `attempt`, `staleNotifiedAt`, índices, `GraderAlertState`, enum.
- `src/lib/notifications/notify.ts` — três gatilhos novos.
- `src/lib/video-comprehension-actions.ts` — tentativas e reprovação.
- `src/lib/video-comprehension-data.ts` — varredura e leitura por tentativa.
- `src/components/me/comprehension-grade-modal.tsx` — escala 1–10.
- `src/app/api/cron/evaluations/route.ts` — pendura a varredura.
- `src/components/sector/video-modal.tsx` — `autoPlay`.
- `src/components/sector/video-card.tsx` — `autoOpen`.
- `src/components/sector/sector-page.tsx` — lê os search params.
- `src/lib/pending-content.ts` — campos novos em `PendingItem`.
- `src/lib/progress-page-data.ts` — carrega os campos novos e as reprovações.
- `src/components/progress/pending-content.tsx` — grupo "Refazer" e sinalização.
- `src/types/evaluation.ts` — `attempt` no registro do DHO.

---

# Fase 1 — modelo, ciclo e avisos

### Task 1: Constantes e predicados da aprovação

**Files:**
- Modify: `src/lib/video-comprehension.ts`
- Test: `src/lib/video-comprehension.test.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `COMPREHENSION_GRADE_MIN = 1`, `COMPREHENSION_PASS_MIN = 7`, `isPassing(grade: number): boolean`, `rejectionLevel(rejections: number): 0 | 1 | 2`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/video-comprehension.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPREHENSION_GRADE_MIN,
  COMPREHENSION_PASS_MIN,
  isPassing,
  rejectionLevel,
} from "./video-comprehension";

test("a escala começa em 1 e aprova a partir de 7", () => {
  assert.equal(COMPREHENSION_GRADE_MIN, 1);
  assert.equal(COMPREHENSION_PASS_MIN, 7);
});

test("isPassing separa reprovado de aprovado na borda do 7", () => {
  assert.equal(isPassing(6), false);
  assert.equal(isPassing(7), true);
  assert.equal(isPassing(10), true);
  assert.equal(isPassing(1), false);
});

test("rejectionLevel satura em 2: a terceira reprovação não cria estado novo", () => {
  assert.equal(rejectionLevel(0), 0);
  assert.equal(rejectionLevel(1), 1);
  assert.equal(rejectionLevel(2), 2);
  assert.equal(rejectionLevel(5), 2);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx --test src/lib/video-comprehension.test.ts`
Expected: FAIL — `isPassing` e `rejectionLevel` não existem.

- [ ] **Step 3: Implementar**

Acrescentar ao fim de `src/lib/video-comprehension.ts`:

```ts
/** Menor nota que o Gestor pode dar. A escala era 0–10 até 22/09. */
export const COMPREHENSION_GRADE_MIN = 1;

/** A partir daqui o colaborador está aprovado e o vídeo fica concluído. */
export const COMPREHENSION_PASS_MIN = 7;

export function isPassing(grade: number): boolean {
  return grade >= COMPREHENSION_PASS_MIN;
}

/**
 * Quanto destaque o vídeo reprovado recebe em Meu Progresso. Satura em 2: a
 * terceira reprovação e as seguintes repetem o tratamento da segunda — não há
 * teto de tentativas, e escalar a cor para sempre não comunica nada.
 */
export function rejectionLevel(rejections: number): 0 | 1 | 2 {
  if (rejections <= 0) return 0;
  return rejections === 1 ? 1 : 2;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx --test src/lib/video-comprehension.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-comprehension.ts src/lib/video-comprehension.test.ts
git commit -m "Compreensão de vídeo: escala 1–10, corte em 7 e nível de reprovação"
```

---

### Task 2: Decisão pura dos avisos ao gestor

**Files:**
- Create: `src/lib/video-comprehension-alerts.ts`
- Test: `src/lib/video-comprehension-alerts.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ALERT_EVERY = 5`, `STALE_DAYS = 3`, `graderQueueAlert(pendingCount: number, lastNotifiedCount: number): { notify: boolean; lastNotified: number }`, `isStale(submittedAt: Date, staleNotifiedAt: Date | null, now: Date): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/video-comprehension-alerts.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { graderQueueAlert, isStale, ALERT_EVERY, STALE_DAYS } from "./video-comprehension-alerts";

const DAY = 24 * 60 * 60 * 1000;

test("os patamares são de 5 em 5 e a varredura olha 3 dias", () => {
  assert.equal(ALERT_EVERY, 5);
  assert.equal(STALE_DAYS, 3);
});

test("avisa ao chegar no quinto e não repete enquanto a fila fica no mesmo patamar", () => {
  assert.deepEqual(graderQueueAlert(5, 0), { notify: true, lastNotified: 5 });
  assert.deepEqual(graderQueueAlert(6, 5), { notify: false, lastNotified: 5 });
  assert.deepEqual(graderQueueAlert(9, 5), { notify: false, lastNotified: 5 });
});

test("avisa de novo no décimo", () => {
  assert.deepEqual(graderQueueAlert(10, 5), { notify: true, lastNotified: 10 });
});

test("um salto de 4 para 6 não perde o gatilho", () => {
  assert.deepEqual(graderQueueAlert(4, 0), { notify: false, lastNotified: 0 });
  assert.deepEqual(graderQueueAlert(6, 0), { notify: true, lastNotified: 5 });
});

test("a fila que encolhe rearma o patamar", () => {
  assert.deepEqual(graderQueueAlert(3, 5), { notify: false, lastNotified: 0 });
  assert.deepEqual(graderQueueAlert(7, 10), { notify: false, lastNotified: 5 });
});

test("fila vazia não avisa e zera o patamar", () => {
  assert.deepEqual(graderQueueAlert(0, 10), { notify: false, lastNotified: 0 });
});

test("resposta parada há 3 dias entra na varredura, uma vez só", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  const old = new Date(now.getTime() - 3 * DAY);
  const recent = new Date(now.getTime() - 2 * DAY);

  assert.equal(isStale(old, null, now), true);
  assert.equal(isStale(recent, null, now), false);
  assert.equal(isStale(old, new Date("2026-09-21T00:00:00Z"), now), false);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx --test src/lib/video-comprehension-alerts.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Implementar**

Criar `src/lib/video-comprehension-alerts.ts`:

```ts
/**
 * Quando o Gestor é avisado de que há respostas de compreensão esperando nota.
 *
 * Puro de propósito: o banco entrega o tamanho da fila e a data do envio; a
 * decisão é testada sem ele — o mesmo desenho de `video-comprehension-scope`.
 *
 * O contador vermelho de Minhas Avaliações continua existindo. Estes avisos
 * somam a ele: o contador diz "há trabalho"; o sino cutuca.
 */

/** A cada 5 pendências na fila, um aviso. */
export const ALERT_EVERY = 5;

/** Resposta sem nota há mais dias que isto entra na varredura. */
export const STALE_DAYS = 3;

export interface QueueAlert {
  notify: boolean;
  /** Novo valor de `GraderAlertState.lastNotifiedCount`. */
  lastNotified: number;
}

/**
 * Patamar corrente da fila (múltiplo de 5 abaixo dela) contra o último
 * avisado. Subiu de patamar, avisa. Desceu, rearma — senão, uma fila que vai
 * a 10, é zerada e volta a 10 nunca mais avisaria.
 */
export function graderQueueAlert(pendingCount: number, lastNotifiedCount: number): QueueAlert {
  const level = Math.floor(pendingCount / ALERT_EVERY) * ALERT_EVERY;
  if (level > lastNotifiedCount) return { notify: true, lastNotified: level };
  return { notify: false, lastNotified: Math.min(lastNotifiedCount, level) };
}

/**
 * Escape por tempo. Sem ele, quem responde três vídeos e para nunca completa
 * um grupo de 5 — a resposta ficaria órfã esperando nota para sempre.
 * `staleNotifiedAt` garante um aviso por resposta, não um por varredura.
 */
export function isStale(submittedAt: Date, staleNotifiedAt: Date | null, now: Date): boolean {
  if (staleNotifiedAt) return false;
  return now.getTime() - submittedAt.getTime() >= STALE_DAYS * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx --test src/lib/video-comprehension-alerts.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-comprehension-alerts.ts src/lib/video-comprehension-alerts.test.ts
git commit -m "Compreensão de vídeo: regra pura dos avisos ao gestor (5 em 5 e varredura de 3 dias)"
```

---

### Task 3: Schema e migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260922100000_video_comprehension_attempts/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `VideoComprehension.attempt: Int`, `VideoComprehension.staleNotifiedAt: DateTime?`, model `GraderAlertState { graderId, lastNotifiedCount, lastNotifiedAt }`, `NotificationKind.TREINAMENTO`.

- [ ] **Step 1: Editar o schema**

Em `prisma/schema.prisma`, no model `VideoComprehension`: trocar `@@unique([userId, videoId])` pelas linhas abaixo e acrescentar os dois campos antes dos índices:

```prisma
  /** 1 na primeira resposta; +1 a cada reprovação. Não há teto. */
  attempt Int @default(1)

  /** Varredura de 3 dias: o gestor já foi cutucado sobre esta resposta. */
  staleNotifiedAt DateTime?

  @@unique([userId, videoId, attempt])
  @@index([gradedAt])
  @@index([videoId])
  @@index([userId, videoId])
```

Acrescentar o model novo:

```prisma
/**
 * Último patamar de fila já avisado a cada Gestor, para o aviso de 5 em 5 não
 * repetir. Uma linha por Gestor, criada na primeira vez que ele é avisado.
 */
model GraderAlertState {
  graderId          String   @id
  grader            User     @relation("GraderAlertState", fields: [graderId], references: [id], onDelete: Cascade)
  lastNotifiedCount Int      @default(0)
  lastNotifiedAt    DateTime @default(now())
}
```

No model `User`, acrescentar o lado inverso da relação:

```prisma
  graderAlertState GraderAlertState? @relation("GraderAlertState")
```

No enum `NotificationKind`, acrescentar `TREINAMENTO` como último valor.

- [ ] **Step 2: Escrever a migration à mão**

Criar `prisma/migrations/20260922100000_video_comprehension_attempts/migration.sql`:

```sql
-- Uma resposta deixa de ser única por vídeo: cada reprovação abre uma
-- tentativa. Tudo que existe hoje é a tentativa 1 — não há backfill a
-- escrever, o DEFAULT resolve.
ALTER TABLE "VideoComprehension" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "VideoComprehension" ADD COLUMN "staleNotifiedAt" TIMESTAMP(3);

-- O índice novo nasce ANTES de o antigo morrer: entre os dois passos a tabela
-- nunca fica sem chave, e uma reversão não deixa buraco.
CREATE UNIQUE INDEX "VideoComprehension_userId_videoId_attempt_key"
  ON "VideoComprehension"("userId", "videoId", "attempt");
CREATE INDEX "VideoComprehension_userId_videoId_idx"
  ON "VideoComprehension"("userId", "videoId");

DROP INDEX "VideoComprehension_userId_videoId_key";

CREATE TABLE "GraderAlertState" (
    "graderId" TEXT NOT NULL,
    "lastNotifiedCount" INTEGER NOT NULL DEFAULT 0,
    "lastNotifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraderAlertState_pkey" PRIMARY KEY ("graderId")
);

ALTER TABLE "GraderAlertState" ADD CONSTRAINT "GraderAlertState_graderId_fkey"
  FOREIGN KEY ("graderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Aviso de reprovação ao colaborador. CONTEUDO significa "material novo" e
-- mentiria no sino.
ALTER TYPE "NotificationKind" ADD VALUE 'TREINAMENTO';
```

- [ ] **Step 3: Aplicar e gerar o client**

Run: `npm run db:migrate -- --name video_comprehension_attempts` e, se o Prisma acusar que a migration já existe no diretório, use `npx prisma migrate deploy` seguido de `npm run db:generate`.
Expected: a migration aplica sem `drift`; `npx prisma migrate status` responde que o banco está em dia.

- [ ] **Step 4: Verificar que o schema e o banco concordam**

Run: `npx prisma validate && npm run typecheck`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260922100000_video_comprehension_attempts
git commit -m "Compreensão de vídeo: tentativas no banco, estado de aviso do gestor e kind TREINAMENTO"
```

---

### Task 4: Gatilhos do sino

**Files:**
- Modify: `src/lib/notifications/notify.ts`

**Interfaces:**
- Consumes: `graderQueueAlert`, `isStale` (Task 2); `attempt`, `staleNotifiedAt`, `GraderAlertState`, `TREINAMENTO` (Task 3); `resolveGraders`, `loadGraderCandidates` de `video-comprehension-scope`/`-data`.
- Produces: `notifyComprehensionRejected(params: { userId: string; videoTitle: string; subsectorSlug: string; videoId: string }): Promise<void>`, `notifyGraderQueue(graderIds: readonly string[]): Promise<void>`.

- [ ] **Step 1: Implementar os dois gatilhos**

Acrescentar ao fim de `src/lib/notifications/notify.ts` (o `silently` e o tipo `Db` já existem no topo do arquivo):

```ts
/**
 * Reprovado: o vídeo volta a pendente e o colaborador é chamado de volta.
 *
 * O link já abre o player reproduzindo (ver `sector-page`): clicar no aviso
 * leva ao vídeo, não à lista de vídeos.
 */
export async function notifyComprehensionRejected(params: {
  userId: string;
  videoId: string;
  videoTitle: string;
  subsectorSlug: string;
}): Promise<void> {
  await silently("reprovação de compreensão", async () => {
    await prisma.notification.create({
      data: {
        kind: "TREINAMENTO",
        title: "Vamos rever esse vídeo?",
        body: `Opa! Não foi dessa vez — assista ao vídeo "${params.videoTitle}" novamente.`,
        href: `/setores/${params.subsectorSlug}?aba=instrucoes-video&video=${params.videoId}&assistir=1`,
        audience: [],
        targetUserId: params.userId,
      },
    });
  });
}

/**
 * Fila do Gestor num novo patamar de 5. Quem decide é `graderQueueAlert`; aqui
 * só se lê o estado, grava-se o aviso e guarda-se o patamar novo.
 *
 * A contagem da fila é a mesma de Minhas Avaliações, então o aviso nunca
 * discorda do contador vermelho.
 */
export async function notifyGraderQueue(graderIds: readonly string[]): Promise<void> {
  await silently("fila do gestor", async () => {
    const { countPendingComprehensionTasks } = await import("@/lib/video-comprehension-data");
    const { graderQueueAlert } = await import("@/lib/video-comprehension-alerts");

    for (const graderId of graderIds) {
      const pending = await countPendingComprehensionTasks(graderId);
      const state = await prisma.graderAlertState.findUnique({
        where: { graderId },
        select: { lastNotifiedCount: true },
      });
      const decision = graderQueueAlert(pending, state?.lastNotifiedCount ?? 0);

      if (decision.notify) {
        await prisma.notification.create({
          data: {
            kind: "AVALIACAO",
            title: "Respostas esperando sua nota",
            body: `${pending} respostas de compreensão de vídeo aguardam avaliação.`,
            href: "/minhas-avaliacoes",
            audience: [],
            targetUserId: graderId,
          },
        });
      }

      await prisma.graderAlertState.upsert({
        where: { graderId },
        create: { graderId, lastNotifiedCount: decision.lastNotified },
        update: { lastNotifiedCount: decision.lastNotified, lastNotifiedAt: new Date() },
      });
    }
  });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

**Os `await import` são obrigatórios, não estilo.** A Task 5 faz `video-comprehension-data` importar `notify`, e `notifyGraderQueue` precisa de `countPendingComprehensionTasks` — os dois módulos passam a depender um do outro. O import dinâmico quebra o ciclo em tempo de carga. Não os mova para o topo; se o `lint` reclamar, acrescente a exceção com um comentário explicando o ciclo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/notify.ts
git commit -m "Sino: avisos de reprovação ao colaborador e de fila cheia ao gestor"
```

---

### Task 5: Varredura das respostas paradas

**Files:**
- Modify: `src/lib/video-comprehension-data.ts`
- Modify: `src/app/api/cron/evaluations/route.ts`

**Interfaces:**
- Consumes: `isStale` (Task 2), `notifyGraderQueue` (Task 4), `resolveGraders`/`loadGraderCandidates` (já existentes no arquivo).
- Produces: `sweepStaleComprehensions(): Promise<number>` — devolve quantas respostas foram marcadas.

- [ ] **Step 1: Implementar a varredura**

Acrescentar ao fim de `src/lib/video-comprehension-data.ts`:

```ts
/**
 * Respostas sem nota há mais de `STALE_DAYS`, cutucando os Gestores que podem
 * avaliá-las. Uma vez por resposta (`staleNotifiedAt`), não uma por rodada.
 *
 * Chamada pela rota de cron, ao lado de `sweepAvailability`. Sem ela, quem
 * responde três vídeos e para nunca completa um grupo de 5 e a resposta fica
 * esperando para sempre.
 */
export async function sweepStaleComprehensions(): Promise<number> {
  const now = new Date();
  const [rows, candidates] = await Promise.all([
    prisma.videoComprehension.findMany({
      where: { gradedAt: null, staleNotifiedAt: null },
      select: {
        id: true,
        submittedAt: true,
        staleNotifiedAt: true,
        user: { select: { id: true, sectorId: true } },
      },
    }),
    loadGraderCandidates(),
  ]);

  const stale = rows.filter((r) => isStale(r.submittedAt, r.staleNotifiedAt, now));
  if (stale.length === 0) return 0;

  const graderIds = new Set<string>();
  for (const r of stale) {
    const author: ComprehensionAuthor = { authorId: r.user.id, authorSectorId: r.user.sectorId };
    for (const g of resolveGraders(author, candidates)) graderIds.add(g.id);
  }

  await prisma.videoComprehension.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: { staleNotifiedAt: now },
  });

  await notifyGraderQueue([...graderIds]);
  return stale.length;
}
```

Acrescentar aos imports do arquivo:

```ts
import { isStale } from "@/lib/video-comprehension-alerts";
import { notifyGraderQueue } from "@/lib/notifications/notify";
```

- [ ] **Step 2: Pendurar na rota de cron**

Em `src/app/api/cron/evaluations/route.ts`, importar:

```ts
import { sweepStaleComprehensions } from "@/lib/video-comprehension-data";
```

e, dentro do `try` do `GET`, logo depois de `const released = await sweepAvailability();`:

```ts
    // Respostas de compreensão paradas. Falha aqui não derruba a varredura de
    // avaliações, que é a razão original desta rota.
    const comprehension = await sweepStaleComprehensions().catch((e) => {
      console.error("[cron/evaluations] varredura de compreensão:", e);
      return 0;
    });
```

e acrescentar `comprehension` ao JSON de resposta:

```ts
    return NextResponse.json({ ok: true, released, comprehension, whatsapp });
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/video-comprehension-data.ts src/app/api/cron/evaluations/route.ts
git commit -m "Compreensão de vídeo: varredura de respostas paradas na rota de cron"
```

---

### Task 6: Envio por tentativa e reprovação na nota

**Files:**
- Modify: `src/lib/video-comprehension-actions.ts`
- Test: `src/lib/video-comprehension-cycle.dbtest.ts` (criar)

**Interfaces:**
- Consumes: `isPassing`, `COMPREHENSION_GRADE_MIN` (Task 1); `notifyComprehensionRejected`, `notifyGraderQueue` (Task 4); `attempt` (Task 3).
- Produces: `submitVideoComprehension` e `gradeVideoComprehension` com o comportamento novo (assinaturas inalteradas).

- [ ] **Step 1: Escrever o teste de banco que falha**

Criar `src/lib/video-comprehension-cycle.dbtest.ts`:

```ts
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";

/**
 * O ciclo completo contra o Postgres: responder, reprovar, reassistir,
 * responder de novo. O que este teste protege é a regra que não cabe em
 * módulo puro — a transação que devolve o vídeo a pendente.
 */

const MARK = "#CYCLE";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let colabId = "";
let videoId = "";
let subsectorId = "";
let sectorId = "";

before(async () => {
  const sector = await prisma.sector.create({
    data: { slug: `cyc-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = sector.id;

  const sub = await prisma.subsector.create({
    data: { slug: `cycsub-${stamp()}`, label: `Sub ${MARK}`, kind: "PADRAO", order: 1, sectorId },
    select: { id: true },
  });
  subsectorId = sub.id;

  const colab = await prisma.user.create({
    data: {
      username: `cyc-${stamp()}${MARK}`,
      fullName: `Colaborador ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  colabId = colab.id;

  const video = await prisma.video.create({
    data: { title: `Vídeo ${MARK}`, kind: "INSTRUCAO", subsectorId, filePath: "/uploads/x.mp4" },
    select: { id: true },
  });
  videoId = video.id;
});

after(async () => {
  await prisma.videoComprehension.deleteMany({ where: { userId: colabId } });
  await prisma.contentProgress.deleteMany({ where: { userId: colabId } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: colabId } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("a segunda tentativa convive com a primeira", async () => {
  await prisma.contentProgress.create({
    data: { userId: colabId, videoId, endedAt: new Date(), completed: false },
  });
  await prisma.videoComprehension.create({
    data: { userId: colabId, videoId, answer: "primeira resposta", attempt: 1, grade: 5, gradedAt: new Date() },
  });
  await prisma.videoComprehension.create({
    data: { userId: colabId, videoId, answer: "segunda resposta", attempt: 2 },
  });

  const all = await prisma.videoComprehension.findMany({
    where: { userId: colabId, videoId },
    orderBy: { attempt: "asc" },
    select: { attempt: true },
  });
  assert.deepEqual(all.map((a) => a.attempt), [1, 2]);
});

test("a mesma tentativa duas vezes é recusada pelo banco", async () => {
  await assert.rejects(
    prisma.videoComprehension.create({
      data: { userId: colabId, videoId, answer: "duplicada", attempt: 2 },
    }),
  );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx --test --test-concurrency=1 src/lib/video-comprehension-cycle.dbtest.ts`
Expected: FAIL enquanto a Task 3 não estiver aplicada no banco de teste; com ela aplicada, PASS. Se falhar por campo `attempt` inexistente, rode `npm run db:generate`.

- [ ] **Step 3: Reescrever o envio para criar tentativas**

Em `src/lib/video-comprehension-actions.ts`, substituir o bloco `try { const now = new Date(); ... }` de `submitVideoComprehension` por:

```ts
  // Tentativa pendente bloqueia: responder de novo enquanto o Gestor não deu a
  // nota criaria duas respostas na fila sobre o mesmo vídeo.
  const pending = await prisma.videoComprehension.findFirst({
    where: { userId: user.id, videoId, gradedAt: null },
    select: { id: true },
  });
  if (pending) return { ok: false, error: "Sua resposta anterior ainda está em avaliação." };

  try {
    const now = new Date();
    const last = await prisma.videoComprehension.findFirst({
      where: { userId: user.id, videoId },
      orderBy: { attempt: "desc" },
      select: { attempt: true },
    });
    const attempt = (last?.attempt ?? 0) + 1;

    await prisma.$transaction([
      prisma.videoComprehension.create({ data: { userId: user.id, videoId, answer, attempt } }),
      // Responder é o que conclui o vídeo. Reprovar desfaz isto.
      prisma.contentProgress.update({
        where: { userId_videoId: { userId: user.id, videoId } },
        data: { completed: true, completedAt: now },
      }),
    ]);

    // Fila do Gestor num novo patamar de 5. Depois do commit, e sem lançar.
    const candidates = await loadGraderCandidates();
    const graders = resolveGraders(
      { authorId: user.id, authorSectorId: user.sectorId ?? null },
      candidates,
    );
    void notifyGraderQueue(graders.map((g) => g.id));

    revalidatePath("/minhas-avaliacoes");
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Dois envios simultâneos: o unique [userId, videoId, attempt] barra o segundo.
      return { ok: false, error: "Sua resposta anterior ainda está em avaliação." };
    }
    console.error("[submitVideoComprehension] falha:", error);
    return { ok: false, error: "Não foi possível enviar sua resposta." };
  }
```

Acrescentar aos imports do arquivo:

```ts
import { resolveGraders } from "@/lib/video-comprehension-scope";
import { notifyComprehensionRejected, notifyGraderQueue } from "@/lib/notifications/notify";
import { COMPREHENSION_GRADE_MIN, isPassing } from "@/lib/video-comprehension";
```

Confirme que `getCurrentUser()` devolve `sectorId`; se não devolver, leia-o com `prisma.user.findUnique({ where: { id: user.id }, select: { sectorId: true } })` antes de montar o autor.

- [ ] **Step 4: Reescrever a nota para reprovar**

No mesmo arquivo, trocar o `gradeSchema` por:

```ts
const gradeSchema = z.object({
  id: z.string().min(1),
  grade: z.number().int().min(COMPREHENSION_GRADE_MIN).max(COMPREHENSION_GRADE_MAX),
  comment: z.string().trim().max(2000).optional(),
});
```

e a mensagem de erro correspondente por:

```ts
  if (!parsed.success) {
    return {
      ok: false,
      error: `Nota inválida: use um inteiro de ${COMPREHENSION_GRADE_MIN} a ${COMPREHENSION_GRADE_MAX}.`,
    };
  }
```

Ampliar o `select` do `target` para carregar o que o aviso precisa:

```ts
  const target = await prisma.videoComprehension.findUnique({
    where: { id },
    select: {
      gradedAt: true,
      videoId: true,
      video: { select: { title: true, subsector: { select: { slug: true } } } },
      user: { select: { id: true, sectorId: true } },
    },
  });
```

E, depois do `if (count === 0) ...`, antes dos `revalidatePath`:

```ts
    // Reprovado: o vídeo volta a pendente e o `endedAt` é zerado — sem isso, o
    // colaborador responderia de novo sem reassistir.
    if (!isPassing(grade)) {
      await prisma.contentProgress.update({
        where: { userId_videoId: { userId: target.user.id, videoId: target.videoId } },
        data: { completed: false, completedAt: null, endedAt: null },
      });
      void notifyComprehensionRejected({
        userId: target.user.id,
        videoId: target.videoId,
        videoTitle: target.video.title,
        subsectorSlug: target.video.subsector.slug,
      });
      revalidatePath("/progresso");
    }
```

- [ ] **Step 5: Rodar tudo**

Run: `npm run typecheck && npm run lint && npm test && npx tsx --test --test-concurrency=1 src/lib/video-comprehension-cycle.dbtest.ts`
Expected: PASS em todos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-comprehension-actions.ts src/lib/video-comprehension-cycle.dbtest.ts
git commit -m "Compreensão de vídeo: tentativas no envio e reprovação devolve o vídeo a pendente"
```

---

### Task 7: Escala 1–10 na tela do gestor

**Files:**
- Modify: `src/components/me/comprehension-grade-modal.tsx`

**Interfaces:**
- Consumes: `COMPREHENSION_GRADE_MIN`, `COMPREHENSION_PASS_MIN` (Task 1).
- Produces: nada consumido adiante.

- [ ] **Step 1: Trocar a régua dos botões**

Localizar a constante `GRADES` no topo do arquivo e trocá-la por:

```ts
const GRADES = Array.from(
  { length: COMPREHENSION_GRADE_MAX - COMPREHENSION_GRADE_MIN + 1 },
  (_, i) => i + COMPREHENSION_GRADE_MIN,
);
```

Ajustar o import para incluir `COMPREHENSION_GRADE_MIN` e `COMPREHENSION_PASS_MIN`, e trocar o rótulo:

```tsx
          <Label>
            Nível de compreensão ({COMPREHENSION_GRADE_MIN} a {COMPREHENSION_GRADE_MAX})
          </Label>
          <p className="mt-1 text-[11px] text-muted">
            Abaixo de {COMPREHENSION_PASS_MIN}, o colaborador assiste ao vídeo e responde de novo.
          </p>
```

A grade de botões passa de 11 para 10 colunas: trocar `sm:grid-cols-11` por `sm:grid-cols-10`.

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Conferir na tela**

Abrir `/minhas-avaliacoes` como Gestor com uma resposta pendente. Esperado: dez botões (1 a 10), sem o 0, e a frase sobre o corte em 7 abaixo do rótulo.

- [ ] **Step 4: Commit**

```bash
git add src/components/me/comprehension-grade-modal.tsx
git commit -m "Minhas Avaliações: nota de 1 a 10 e aviso do corte em 7"
```

---

### Task 8: Link do aviso abre o vídeo reproduzindo

**Files:**
- Modify: `src/components/sector/video-modal.tsx`
- Modify: `src/components/sector/video-card.tsx`
- Modify: `src/components/sector/sector-page.tsx`

**Interfaces:**
- Consumes: o `href` montado em `notifyComprehensionRejected` (Task 4): `?aba=instrucoes-video&video={id}&assistir=1`.
- Produces: `VideoModalProps.autoPlay?: boolean`; `VideoCard` aceita `autoOpen?: boolean`.

- [ ] **Step 1: `autoPlay` no modal**

Em `src/components/sector/video-modal.tsx`, acrescentar à interface `VideoModalProps`:

```ts
  /**
   * Abrir já reproduzindo (veio do aviso de reprovação). O navegador pode
   * recusar: sem gesto do usuário, só autoriza vídeo mudo — e treinamento
   * mudo é pior que play manual. Recusou, o vídeo fica carregado com os
   * controles à vista.
   */
  autoPlay?: boolean;
```

Repassar `autoPlay` no `createPortal` para `VideoModalContent` (acrescentar à lista de props do componente interno, tipado como `autoPlay: boolean`, e passar `autoPlay={Boolean(autoPlay)}`).

Dentro de `VideoModalContent`, junto dos outros `useEffect`:

```tsx
  // Play automático com desistência silenciosa. Nunca cai para mudo.
  useEffect(() => {
    if (!autoPlay) return;
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => {
      /* bloqueado pelo navegador: os controles nativos já estão à vista */
    });
  }, [autoPlay]);
```

- [ ] **Step 2: `autoOpen` no card**

Em `src/components/sector/video-card.tsx`, acrescentar `autoOpen?: boolean` às props do card e, no `useState` do player, abrir já reproduzindo:

```tsx
  const [state, setState] = useState<{ open: boolean; askNow: boolean }>({
    open: Boolean(autoOpen),
    askNow: false,
  });
```

Passar `autoPlay={Boolean(autoOpen)}` nas duas instâncias de `<VideoModal>` do arquivo (linhas ~250 e ~304).

- [ ] **Step 3: Ler os parâmetros na página do setor**

Em `src/components/sector/sector-page.tsx`, junto do trecho que já mexe em `url.searchParams` (linha ~139):

```tsx
  // Veio do aviso de reprovação: abre aquele vídeo já reproduzindo e limpa a
  // URL, para o F5 não reabrir o player.
  const [autoOpenId, setAutoOpenId] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("video");
    if (!id || url.searchParams.get("assistir") !== "1") return;
    setAutoOpenId(id);
    url.searchParams.delete("video");
    url.searchParams.delete("assistir");
    window.history.replaceState(null, "", url.toString());
  }, []);
```

Onde a página renderiza os `VideoCard`, passar `autoOpen={video.id === autoOpenId}`.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Conferir o caminho inteiro na tela**

Reprovar uma resposta como Gestor, entrar como o colaborador, clicar no aviso do sino. Esperado: a página do setor abre na aba Instruções em Vídeo com o player daquele vídeo aberto e reproduzindo (ou carregado, se o navegador recusar); a URL fica sem `?video=&assistir=`; o F5 não reabre o modal.

- [ ] **Step 6: Commit**

```bash
git add src/components/sector/video-modal.tsx src/components/sector/video-card.tsx src/components/sector/sector-page.tsx
git commit -m "Aviso de reprovação: o link abre o vídeo já reproduzindo, com recuo se o navegador barrar"
```

---

### Task 9: DHO mostra as tentativas

**Files:**
- Modify: `src/types/evaluation.ts`
- Modify: `src/lib/video-comprehension-data.ts`
- Modify: `src/components/hr/evaluation-results-panel.tsx`

**Interfaces:**
- Consumes: `attempt` (Task 3).
- Produces: `VideoComprehensionEntry.attempt: number`; `average` passa a usar a última nota de cada vídeo.

- [ ] **Step 1: Tipo**

Em `src/types/evaluation.ts`, no `VideoComprehensionEntry`, corrigir o comentário do `grade` e acrescentar o campo:

```ts
  /** 1–10. */
  grade: number;
  /** Número da tentativa: 1 na primeira resposta, +1 a cada reprovação. */
  attempt: number;
  /** Agrupa as tentativas do mesmo vídeo no cálculo da média. */
  videoId: string;
```

- [ ] **Step 2: Leitura**

Em `getVideoComprehensionResults` (`src/lib/video-comprehension-data.ts`), acrescentar `attempt: true` e `videoId: true` ao `select`, `attempt: r.attempt` ao objeto `entry`, e substituir o cálculo da média por:

```ts
  const subjects = [...bySubject.values()];
  for (const s of subjects) {
    // A média usa a ÚLTIMA nota de cada vídeo, não todas as tentativas. Somar
    // as reprovadas puniria duas vezes quem foi reprovado e depois aprovado —
    // a média deixaria de medir compreensão e passaria a medir histórico.
    const latest = new Map<string, number>();
    for (const e of s.entries) {
      // `entries` chega ordenado por `gradedAt` desc: o primeiro de cada vídeo
      // é o mais recente.
      if (!latest.has(e.videoId)) latest.set(e.videoId, e.grade);
    }
    const grades = [...latest.values()];
    s.average = Math.round((grades.reduce((a, g) => a + g, 0) / grades.length) * 10) / 10;
  }
```

Para isso, `VideoComprehensionEntry` também precisa de `videoId: string` — acrescente-o ao tipo (Step 1) e ao `entry`.

- [ ] **Step 3: Exibição**

Em `src/components/hr/evaluation-results-panel.tsx`, no nível 3 (lista de registros de compreensão), acrescentar o número da tentativa ao lado do título do vídeo:

```tsx
{entry.attempt > 1 && (
  <span className="ml-2 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-muted">
    tentativa {entry.attempt}
  </span>
)}
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/evaluation.ts src/lib/video-comprehension-data.ts src/components/hr/evaluation-results-panel.tsx
git commit -m "DHO: Resultados de Treinamentos lista as tentativas e a média usa a última nota"
```

---

# Fase 2 — Meu Progresso

### Task 10: Dados do item pendente

**Files:**
- Modify: `src/lib/pending-content.ts`
- Modify: `src/lib/progress-page-data.ts`

**Interfaces:**
- Consumes: `attempt`, `grade` (Task 3); `COMPREHENSION_PASS_MIN` (Task 1).
- Produces: `PendingItem` com `filePath?`, `thumbnailPath?`, `transcriptText?`, `subsectorSlug`, `ended`, `answered`, `rejections`.

- [ ] **Step 1: Ampliar o tipo**

Em `src/lib/pending-content.ts`:

```ts
export interface PendingItem {
  id: string;
  kind: PendingKind;
  title: string;
  sector: string;
  /** Duração para vídeos, tamanho para documentos. */
  meta: string;
  /** Slug do subsetor dono — leva à tela de origem do conteúdo. */
  subsectorSlug: string;
  /** Caminho público do arquivo: o item é executado a partir desta tela. */
  filePath?: string;
  thumbnailPath?: string;
  transcriptText?: string;
  /** Vídeo: chegou ao fim, a pergunta está liberada. */
  ended?: boolean;
  /** Quantas tentativas deste vídeo foram reprovadas (nota < 7). */
  rejections: number;
}
```

- [ ] **Step 2: Carregar os campos**

Em `src/lib/progress-page-data.ts`, ampliar o `select` dos vídeos e documentos:

```ts
            videos: {
              select: {
                id: true,
                title: true,
                filePath: true,
                thumbnailPath: true,
                transcriptText: true,
              },
            },
            documents: {
              select: { id: true, name: true, kind: true, sizeBytes: true, filePath: true },
            },
```

e incluir `slug: true` no `select` implícito do subsetor (acrescentar `slug` ao lado de `label` se ele não vier; o `include` atual traz o registro inteiro, então `sub.slug` já existe).

Acrescentar uma terceira consulta ao `Promise.all`:

```ts
    // Reprovações por vídeo, para a sinalização de "Refazer".
    prisma.videoComprehension.findMany({
      where: { userId, grade: { lt: COMPREHENSION_PASS_MIN } },
      select: { videoId: true },
    }),
```

(importar `COMPREHENSION_PASS_MIN` de `@/lib/video-comprehension`), recebê-la como `rejected` na desestruturação, e montar o mapa:

```ts
  const rejectionsByVideo = new Map<string, number>();
  for (const r of rejected) {
    rejectionsByVideo.set(r.videoId, (rejectionsByVideo.get(r.videoId) ?? 0) + 1);
  }
```

Carregar também quais vídeos já chegaram ao fim:

```ts
    prisma.contentProgress.findMany({
      where: { userId, endedAt: { not: null } },
      select: { videoId: true },
    }),
```

recebida como `endedRows`, virando `const endedVideoIds = new Set(endedRows.map((r) => r.videoId).filter(Boolean) as string[]);`

Por fim, nos dois `addPending`, passar os campos novos:

```ts
        addPending(pendingBySector, sector.label, {
          id: v.id,
          kind: "VIDEO",
          title: v.title,
          sector: sub.label,
          meta: "Vídeo",
          subsectorSlug: sub.slug,
          filePath: v.filePath ?? undefined,
          thumbnailPath: v.thumbnailPath ?? undefined,
          transcriptText: v.transcriptText ?? undefined,
          ended: endedVideoIds.has(v.id),
          rejections: rejectionsByVideo.get(v.id) ?? 0,
        });
```

```ts
        addPending(pendingBySector, sector.label, {
          id: d.id,
          kind: "DOCUMENTO",
          title: d.name,
          sector: sub.label,
          meta: `${d.kind} · ${formatBytes(d.sizeBytes)}`,
          subsectorSlug: sub.slug,
          filePath: d.filePath ?? undefined,
          rejections: 0,
        });
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS. O `typecheck` vai apontar `pending-content.tsx`, que ainda não usa os campos novos — isso é esperado e a Task 11 resolve; se ele quebrar o build, avance para a Task 11 antes de commitar as duas juntas.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pending-content.ts src/lib/progress-page-data.ts
git commit -m "Meu Progresso: o item pendente carrega arquivo, origem e reprovações"
```

---

### Task 11: Executar e sinalizar em Meu Progresso

**Files:**
- Create: `src/components/progress/pending-item-player.tsx`
- Modify: `src/components/progress/pending-content.tsx`

**Interfaces:**
- Consumes: `PendingItem` ampliado (Task 10); `rejectionLevel` (Task 1); `VideoModal` com `autoPlay` (Task 8).
- Produces: nada consumido adiante.

- [ ] **Step 1: O dono do player**

Criar `src/components/progress/pending-item-player.tsx`:

```tsx
"use client";

import { useState } from "react";
import { VideoModal } from "@/components/sector/video-modal";
import type { PendingItem } from "@/lib/pending-content";
import type { VideoItem } from "@/types/sector";

/**
 * Na tela do setor quem instancia o `VideoModal` é o `VideoCard`. Aqui não há
 * card, então este componente é o dono do player em "Meu Progresso".
 *
 * `comprehension` é sempre verdadeiro: só entra em pendências o conteúdo de
 * subsetor PADRAO, que é exatamente onde a pergunta existe.
 */
export function PendingItemPlayer({
  item,
  open,
  onClose,
}: {
  item: PendingItem;
  open: boolean;
  onClose: () => void;
}) {
  const video: VideoItem = {
    id: item.id,
    title: item.title,
    watched: false,
    ended: item.ended,
    filePath: item.filePath,
    thumbnailPath: item.thumbnailPath,
    transcriptText: item.transcriptText,
  };

  return (
    <VideoModal
      video={video}
      open={open}
      onClose={onClose}
      comprehension
      onChanged={() => window.location.reload()}
    />
  );
}

/** Estado de abertura de um item, para a linha da lista. */
export function usePendingPlayer() {
  const [openId, setOpenId] = useState<string | null>(null);
  return { openId, open: (id: string) => setOpenId(id), close: () => setOpenId(null) };
}
```

- [ ] **Step 2: A linha vira botão e ganha sinalização**

Reescrever `src/components/progress/pending-content.tsx`:

```tsx
"use client";

import { AlertTriangle, FileText, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { rejectionLevel } from "@/lib/video-comprehension";
import { PendingItemPlayer, usePendingPlayer } from "./pending-item-player";
import type { PendingCategory, PendingItem } from "@/lib/pending-content";

const REDO_MESSAGE = "Que tal rever com calma? Assista ao vídeo de novo e responda.";

function ItemRow({
  item,
  onPlay,
  playing,
  onClose,
}: {
  item: PendingItem;
  onPlay: () => void;
  playing: boolean;
  onClose: () => void;
}) {
  const isVideo = item.kind === "VIDEO";
  const level = rejectionLevel(item.rejections);

  // Cor nunca sozinha: junto vão o ícone de alerta e o selo "Refazer".
  const tone =
    level === 2
      ? "border-danger/60 bg-danger/10 hover:border-danger"
      : level === 1
        ? "border-warning/60 bg-warning/10 hover:border-warning"
        : "border-border bg-surface hover:border-border-strong";

  function activate() {
    if (isVideo && item.filePath) return onPlay();
    if (item.filePath) window.open(item.filePath, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <button
        type="button"
        onClick={activate}
        aria-label={
          level > 0
            ? `${item.title} — reprovado, assistir novamente`
            : `${item.title} — abrir`
        }
        className={cn(
          "focus-ring flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
          tone,
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            level > 0
              ? "bg-warning/20 text-warning"
              : isVideo
                ? "bg-primary/15 text-primary"
                : "bg-info/15 text-info",
          )}
        >
          {level > 0 ? (
            <AlertTriangle className="h-4 w-4" />
          ) : isVideo ? (
            <PlayCircle className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-foreground">{item.title}</h4>
          <p className="truncate text-xs text-muted">
            {item.sector} · {item.meta}
          </p>
        </div>

        {level > 0 ? (
          <Badge tone="warning" className="shrink-0">
            Refazer
          </Badge>
        ) : (
          <Badge tone={isVideo ? "primary" : "info"} className="shrink-0">
            {isVideo ? "Vídeo" : "Documento"}
          </Badge>
        )}
      </button>

      {level === 2 && <p className="mt-1.5 px-3 text-xs text-muted">{REDO_MESSAGE}</p>}

      {isVideo && <PendingItemPlayer item={item} open={playing} onClose={onClose} />}
    </div>
  );
}

export function PendingContent({ groups }: { groups: readonly PendingCategory[] }) {
  const player = usePendingPlayer();
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  // Reprovados vêm primeiro, num grupo próprio: um vídeo a refazer perdido no
  // meio de quarenta pendências não é sinalização.
  const redo = groups.flatMap((g) => g.items.filter((i) => i.rejections > 0));
  const rest = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.rejections === 0) }))
    .filter((g) => g.items.length > 0);

  function row(item: PendingItem) {
    return (
      <ItemRow
        key={item.id}
        item={item}
        playing={player.openId === item.id}
        onPlay={() => player.open(item.id)}
        onClose={player.close}
      />
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Pendências por categoria</h3>
        <span className="text-xs text-muted">{total} itens a concluir</span>
      </div>

      <div className="space-y-6">
        {redo.length > 0 && (
          <div>
            <div className="mb-2.5 flex items-center gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-warning">
                Refazer
              </h4>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1.5 text-[10px] font-medium text-warning">
                {redo.length}
              </span>
            </div>
            <div className="space-y-2">{redo.map(row)}</div>
          </div>
        )}

        {rest.map((group) => (
          <div key={group.category}>
            <div className="mb-2.5 flex items-center gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {group.category}
              </h4>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-3 px-1.5 text-[10px] font-medium text-muted">
                {group.items.length}
              </span>
            </div>
            <div className="space-y-2">{group.items.map(row)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Se `Badge` não aceitar `tone="warning"` ou o Tailwind não tiver `danger`/`warning`, conferir os tokens em `tailwind.config.ts` e usar os equivalentes do projeto — não introduzir cor nova fora da paleta.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Conferir na tela**

Como colaborador com um vídeo reprovado uma vez e outro reprovado duas: abrir `/progresso`. Esperado: grupo "Refazer" no topo; o de uma reprovação em âmbar com ícone e selo; o de duas em tom mais forte, com a frase abaixo; clicar em qualquer vídeo abre o player ali mesmo; clicar num documento abre em nova aba; navegação por teclado alcança cada linha e o `aria-label` diz o que vai acontecer.

- [ ] **Step 5: Commit**

```bash
git add src/components/progress/pending-item-player.tsx src/components/progress/pending-content.tsx
git commit -m "Meu Progresso: clicar executa o conteúdo e o reprovado ganha grupo Refazer"
```

---

## Verificação final

- [ ] `npm run typecheck && npm run lint && npm test` verdes.
- [ ] `npx tsx --test --test-concurrency=1 "src/**/*.dbtest.ts"` verde.
- [ ] `npx prisma migrate status` diz que o banco está em dia.
- [ ] Caminho completo na tela: colaborador responde → gestor dá 5 → o vídeo volta a pendente em `/progresso` com selo "Refazer" → o sino traz o aviso → clicar abre o player → responder de novo cria a tentativa 2 → gestor dá 8 → o vídeo sai de "Refazer" e o DHO mostra as duas tentativas com média 8.
