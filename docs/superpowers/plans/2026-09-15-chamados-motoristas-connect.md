# Chamados de Motoristas via Build.Flow — Plano de Implementação (etapa 2: Connect)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Connect continua abrindo e acompanhando chamados de Motoristas, mas envia cada um ao Flow, espelha o status recebido por webhook, busca o rastreamento e o comprovante no Flow, e deixa de gerenciar (as abas Chamados e Dashboard saem do setor Motoristas).

**Architecture:** `Ticket` ganha o espelho (`flowId`, `flowSyncedAt`, `flowSyncError`, `externalAssigneeName`). Toda conversa com o Flow fica em `src/lib/flow/` (cliente HTTP, envio com reenvio, receptor do webhook, reconciliação na leitura). O mapa e o modal de "Meus Chamados" não mudam; só a fonte da rota `/api/chamados/[id]/tracking` muda. TI não muda.

**Tech Stack:** Next.js 15 (params/cookies ASSÍNCRONOS), React 19, TypeScript strict, Prisma 6 + PostgreSQL, zod, `node:test` via `npm test`, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-15-chamados-motoristas-connect-flow-design.md`
**Contrato do Flow já implementado:** `BuildFlow/docs/integracao-connect.md`

## Global Constraints

- Variáveis: `FLOW_API_URL`, `FLOW_API_TOKEN`, `FLOW_WEBHOOK_SECRET`. Ausentes → integração desligada com erro explícito (abrir chamado de Motoristas devolve mensagem clara; webhook rejeita; log na subida), nunca silenciosa.
- Webhook recebido: cabeçalhos `x-flow-timestamp` (epoch ms) e `x-flow-signature` = HMAC-SHA256(`${timestamp}.${corpo}`, `FLOW_WEBHOOK_SECRET`) em hex; rejeitar assinatura inválida e |agora − timestamp| > 5 min. Receptor aplica ESTADO (idempotente), nunca transição.
- Reconciliação na leitura: chamado de MOTORISTAS não final (status ≠ CONCLUIDO/CANCELADO) com `flowSyncedAt` mais velho que 60s (ou nulo com `flowId`) é reconsultado no Flow ao montar "Meus Chamados".
- Status Flow → Ticket: o Flow já envia `PENDENTE | ATRIBUIDO | EM_ANDAMENTO | CONCLUIDO | CANCELADO`; validar com zod antes de gravar.
- Verificação: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx next build`. Banco local é gerido por `prisma db push` (sem histórico de migrations); a migration é escrita à mão e validada com `prisma db push` + `prisma migrate diff`.
- Commits pequenos por tarefa; nunca `git push` sem pedido. Textos em português no tom do código vizinho.

---

### Task 1: Espelho do Flow no `Ticket` (schema + migration)

**Files:**
- Modify: `prisma/schema.prisma` (model `Ticket`, após `resolutionNote String?`)
- Create: `prisma/migrations/20260915190000_ticket_flow_mirror/migration.sql`

- [ ] **Step 1: Campos no schema**

Em `model Ticket`, após a linha `resolutionNote String?`, adicione:

```prisma
  // ——— Integração com o Build.Flow (só destination = MOTORISTAS) ———
  // O Flow é o dono do chamado de Motoristas a partir da abertura; aqui fica
  // um ESPELHO para "Meus Chamados" listar e acompanhar sem consultar o Flow a
  // cada tela. `flowSyncError` preenchido = ainda não chegou lá (o cron reenvia).
  flowId               String?   @unique
  flowSyncedAt         DateTime?
  flowSyncError        String?
  // Motorista escolhido na abertura (id de usuário do FLOW). Fica aqui até o
  // envio acontecer — que pode ser no cron, minutos depois.
  flowDriverId         String?
  // Nome do motorista, vindo do Flow. O motorista não é usuário do Connect.
  externalAssigneeName String?
```

- [ ] **Step 2: Migration à mão**

`prisma/migrations/20260915190000_ticket_flow_mirror/migration.sql`:

```sql
-- Espelho do Build.Flow no chamado de Motoristas (ver spec 2026-09-15).
ALTER TABLE "Ticket" ADD COLUMN "flowId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "flowSyncedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "flowSyncError" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "flowDriverId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "externalAssigneeName" TEXT;

CREATE UNIQUE INDEX "Ticket_flowId_key" ON "Ticket"("flowId");
```

- [ ] **Step 3: Aplicar localmente e conferir que a migration bate com o schema**

Run: `npx prisma db push && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
Expected: `db push` aplica sem perda; o `diff` devolve script vazio (`-- This is an empty migration.`), provando que o banco (agora igual ao schema) não difere do datamodel. Depois `npx tsc --noEmit` limpo.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260915190000_ticket_flow_mirror
git commit -m "Chamados de Motoristas: espelho do Build.Flow no Ticket (flowId, sincronização, motorista)"
```

---

### Task 2: Regras puras do espelho + testes

**Files:**
- Create: `src/lib/flow/mirror.ts`
- Create: `src/lib/flow/mirror.test.ts`

**Interfaces:**
- Produces:
  - `flowStatusSchema` (zod enum dos 5 status), `FlowTicketState` (`{ status; driverName; assignedAt; startedAt; finishedAt; distanceKm; cancelReason }` — datas ISO ou null), `flowStateSchema` (zod).
  - `mirrorUpdate(state: FlowTicketState): { status; externalAssigneeName; startedAt; finishedAt; distanceKm; flowSyncedAt; flowSyncError: null }` — dados prontos para `prisma.ticket.update`.
  - `needsReconcile(t: { destination; status; flowId; flowSyncedAt }, now?: Date): boolean`.
  - `RECONCILE_AFTER_MS = 60_000`.

- [ ] **Step 1: Teste (falha primeiro)**

`src/lib/flow/mirror.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { flowStateSchema, mirrorUpdate, needsReconcile, RECONCILE_AFTER_MS } from "./mirror";

const agora = new Date("2026-09-15T12:00:00Z");

test("estado do Flow válido passa; status desconhecido é recusado", () => {
  const ok = flowStateSchema.safeParse({
    status: "EM_ANDAMENTO", driverName: "João", assignedAt: "2026-09-15T11:00:00Z",
    startedAt: "2026-09-15T11:30:00Z", finishedAt: null, distanceKm: null, cancelReason: null,
  });
  assert.equal(ok.success, true);
  const bad = flowStateSchema.safeParse({ status: "EM_ROTA", driverName: null });
  assert.equal(bad.success, false);
});

test("mirrorUpdate aplica ESTADO: status, motorista, datas e limpa o erro de envio", () => {
  const u = mirrorUpdate({
    status: "CONCLUIDO", driverName: "João", assignedAt: "2026-09-15T11:00:00Z",
    startedAt: "2026-09-15T11:30:00Z", finishedAt: "2026-09-15T11:50:00Z", distanceKm: 4.2, cancelReason: null,
  }, agora);
  assert.equal(u.status, "CONCLUIDO");
  assert.equal(u.externalAssigneeName, "João");
  assert.equal(u.startedAt?.toISOString(), "2026-09-15T11:30:00.000Z");
  assert.equal(u.finishedAt?.toISOString(), "2026-09-15T11:50:00.000Z");
  assert.equal(u.distanceKm, 4.2);
  assert.equal(u.flowSyncError, null);
  assert.equal(u.flowSyncedAt, agora);
});

test("mirrorUpdate sem motorista zera o nome (desatribuído)", () => {
  const u = mirrorUpdate({
    status: "PENDENTE", driverName: null, assignedAt: null, startedAt: null, finishedAt: null, distanceKm: null, cancelReason: null,
  }, agora);
  assert.equal(u.status, "PENDENTE");
  assert.equal(u.externalAssigneeName, null);
  assert.equal(u.startedAt, null);
});

test("needsReconcile: só MOTORISTAS com flowId, não final, e espelho velho", () => {
  const base = { destination: "MOTORISTAS", status: "ATRIBUIDO", flowId: "f1", flowSyncedAt: new Date(agora.getTime() - RECONCILE_AFTER_MS - 1) };
  assert.equal(needsReconcile(base, agora), true);
  assert.equal(needsReconcile({ ...base, flowSyncedAt: new Date(agora.getTime() - 1000) }, agora), false);
  assert.equal(needsReconcile({ ...base, status: "CONCLUIDO" }, agora), false);
  assert.equal(needsReconcile({ ...base, status: "CANCELADO" }, agora), false);
  assert.equal(needsReconcile({ ...base, destination: "TI" }, agora), false);
  assert.equal(needsReconcile({ ...base, flowId: null }, agora), false);
  // flowId presente e nunca sincronizado: reconcilia.
  assert.equal(needsReconcile({ ...base, flowSyncedAt: null }, agora), true);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx tsx --test src/lib/flow/mirror.test.ts`
Expected: falha por módulo ausente.

- [ ] **Step 3: Implementar**

`src/lib/flow/mirror.ts`:

```ts
import { z } from "zod";

/**
 * Regras PURAS do espelho do Build.Flow no `Ticket` de Motoristas.
 *
 * O Flow manda o status já no vocabulário do Connect (enum TicketStatus), o
 * nome do motorista e as datas. Aqui só validamos e traduzimos para o que o
 * `prisma.ticket.update` grava. Sem I/O: o mesmo código serve ao webhook, à
 * reconciliação e aos testes.
 */

export const flowStatusSchema = z.enum(["PENDENTE", "ATRIBUIDO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]);

const isoDate = z.string().datetime({ offset: true }).nullable();

export const flowStateSchema = z.object({
  status: flowStatusSchema,
  driverName: z.string().nullable().optional().default(null),
  assignedAt: isoDate.optional().default(null),
  startedAt: isoDate.optional().default(null),
  finishedAt: isoDate.optional().default(null),
  distanceKm: z.number().nullable().optional().default(null),
  cancelReason: z.string().nullable().optional().default(null),
});

export type FlowTicketState = z.infer<typeof flowStateSchema>;

/** Espelho mais velho que isto (chamado não final) é reconsultado no Flow. */
export const RECONCILE_AFTER_MS = 60_000;

function toDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

/** Dados para `prisma.ticket.update`. Aplica o ESTADO recebido, não uma transição. */
export function mirrorUpdate(state: FlowTicketState, now: Date = new Date()) {
  return {
    status: state.status,
    externalAssigneeName: state.driverName ?? null,
    startedAt: toDate(state.startedAt ?? null),
    finishedAt: toDate(state.finishedAt ?? null),
    distanceKm: state.distanceKm ?? null,
    flowSyncedAt: now,
    flowSyncError: null as string | null,
  };
}

export function needsReconcile(
  t: { destination: string; status: string; flowId: string | null; flowSyncedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (t.destination !== "MOTORISTAS" || !t.flowId) return false;
  if (t.status === "CONCLUIDO" || t.status === "CANCELADO") return false;
  if (!t.flowSyncedAt) return true;
  return now.getTime() - t.flowSyncedAt.getTime() > RECONCILE_AFTER_MS;
}
```

- [ ] **Step 4: Rodar teste + tsc**

Run: `npx tsx --test src/lib/flow/mirror.test.ts && npx tsc --noEmit`
Expected: 4 testes passando, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/flow/mirror.ts src/lib/flow/mirror.test.ts
git commit -m "Flow: regras puras do espelho (validação do estado, update, reconciliação)"
```

---

### Task 3: Ambiente, assinatura e receptor do webhook

**Files:**
- Create: `src/lib/flow/env.ts`
- Create: `src/lib/flow/signature.ts` (puro)
- Create: `src/lib/flow/signature.test.ts`
- Create: `src/app/api/integracao/flow/webhook/route.ts`
- Modify: `src/middleware.ts` (liberar `/api/integracao`)

**Interfaces:**
- Produces:
  - `flowEnv(): { apiUrl; apiToken; webhookSecret } | null`.
  - `verifyFlowSignature(input: { secret; timestamp: string | null; signature: string | null; body: string; now?: number }): { ok: true } | { ok: false; reason: string }`, `MAX_SKEW_MS = 5 * 60_000`.

- [ ] **Step 1: Verificar como o middleware trata `/api`**

Run: `grep -n "matcher\|PUBLIC\|/api" src/middleware.ts`
Expected: ver a lista de caminhos públicos / o matcher. Se `/api/integracao` cairia no redirecionamento de login, adicione-o à lista pública (mesma técnica usada para `/api/health` ou `/api/cron`, se existir). Se o middleware já ignora `/api`, nada a fazer — registre a conclusão no commit.

- [ ] **Step 2: Teste da assinatura (falha primeiro)**

`src/lib/flow/signature.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { verifyFlowSignature, MAX_SKEW_MS } from "./signature";

const secret = "s3gr3do";
const body = JSON.stringify({ connectId: "t1", status: "EM_ANDAMENTO" });
const now = 1_757_937_600_000;
function sign(ts: number, b = body, s = secret) {
  return createHmac("sha256", s).update(`${ts}.${b}`).digest("hex");
}

test("assinatura válida e dentro da janela passa", () => {
  const r = verifyFlowSignature({ secret, timestamp: String(now), signature: sign(now), body, now });
  assert.deepEqual(r, { ok: true });
});

test("corpo alterado é rejeitado", () => {
  const r = verifyFlowSignature({ secret, timestamp: String(now), signature: sign(now), body: body + " ", now });
  assert.equal(r.ok, false);
});

test("segredo diferente é rejeitado", () => {
  const r = verifyFlowSignature({ secret, timestamp: String(now), signature: sign(now, body, "outro"), body, now });
  assert.equal(r.ok, false);
});

test("timestamp fora da janela é rejeitado (repetição)", () => {
  const old = now - MAX_SKEW_MS - 1;
  const r = verifyFlowSignature({ secret, timestamp: String(old), signature: sign(old), body, now });
  assert.equal(r.ok, false);
});

test("cabeçalhos ausentes ou timestamp não numérico são rejeitados", () => {
  assert.equal(verifyFlowSignature({ secret, timestamp: null, signature: sign(now), body, now }).ok, false);
  assert.equal(verifyFlowSignature({ secret, timestamp: String(now), signature: null, body, now }).ok, false);
  assert.equal(verifyFlowSignature({ secret, timestamp: "abc", signature: sign(now), body, now }).ok, false);
});
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `npx tsx --test src/lib/flow/signature.test.ts`
Expected: módulo ausente.

- [ ] **Step 4: Implementar `env.ts` e `signature.ts`**

`src/lib/flow/env.ts`:

```ts
/**
 * Variáveis da integração com o Build.Flow. Sem as três, a integração fica
 * DESLIGADA com erro explícito — abrir chamado de Motoristas avisa, o webhook
 * rejeita — nunca silenciosa.
 *
 *   FLOW_API_URL         base do Flow na rede interna (http://buildflow:3000)
 *   FLOW_API_TOKEN       mesmo valor de CONNECT_INTEGRATION_TOKEN no Flow
 *   FLOW_WEBHOOK_SECRET  mesmo valor de CONNECT_WEBHOOK_SECRET no Flow
 */
export function flowEnv(): { apiUrl: string; apiToken: string; webhookSecret: string } | null {
  const apiUrl = process.env.FLOW_API_URL?.trim().replace(/\/+$/, "");
  const apiToken = process.env.FLOW_API_TOKEN?.trim();
  const webhookSecret = process.env.FLOW_WEBHOOK_SECRET?.trim();
  if (!apiUrl || !apiToken || !webhookSecret) return null;
  return { apiUrl, apiToken, webhookSecret };
}

export const FLOW_DISABLED_MESSAGE =
  "A integração com a Logística (Build.Flow) não está configurada. Avise a Retaguarda.";
```

`src/lib/flow/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/** Janela aceita entre o relógio do Flow e o nosso. Fora dela = repetição. */
export const MAX_SKEW_MS = 5 * 60_000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verifica o webhook do Flow: HMAC-SHA256 de `${timestamp}.${corpo}` em hex,
 * nos cabeçalhos x-flow-timestamp / x-flow-signature. Puro, para os testes.
 */
export function verifyFlowSignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.timestamp || !input.signature) return { ok: false, reason: "cabeçalhos ausentes" };
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "timestamp inválido" };
  const now = input.now ?? Date.now();
  if (Math.abs(now - ts) > MAX_SKEW_MS) return { ok: false, reason: "fora da janela de tempo" };
  const expected = createHmac("sha256", input.secret).update(`${ts}.${input.body}`).digest("hex");
  if (!safeEqual(expected, input.signature)) return { ok: false, reason: "assinatura inválida" };
  return { ok: true };
}
```

- [ ] **Step 5: Receptor**

`src/app/api/integracao/flow/webhook/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { flowEnv } from "@/lib/flow/env";
import { verifyFlowSignature } from "@/lib/flow/signature";
import { flowStateSchema, mirrorUpdate } from "@/lib/flow/mirror";

/**
 * POST /api/integracao/flow/webhook — o Flow avisa que o chamado mudou.
 *
 * Idempotente: aplica o ESTADO recebido no espelho. Evento repetido ou fora
 * de ordem não corrompe nada; a reconciliação na leitura cobre o que se perder.
 * Autenticação por assinatura HMAC (sem cookie): o remetente é uma máquina.
 */
export const dynamic = "force-dynamic";

const payloadSchema = flowStateSchema.extend({
  connectId: z.string().min(1),
  flowId: z.string().min(1),
});

export async function POST(request: Request) {
  const env = flowEnv();
  if (!env) {
    console.error("[flow/webhook] FLOW_* ausentes; webhook rejeitado.");
    return NextResponse.json({ error: "Integração não configurada." }, { status: 503 });
  }

  const body = await request.text();
  const check = verifyFlowSignature({
    secret: env.webhookSecret,
    timestamp: request.headers.get("x-flow-timestamp"),
    signature: request.headers.get("x-flow-signature"),
    body,
  });
  if (!check.ok) {
    console.warn(`[flow/webhook] rejeitado: ${check.reason}`);
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 422 });
  }
  const { connectId, flowId, ...state } = parsed.data;

  const ticket = await prisma.ticket.findUnique({
    where: { id: connectId },
    select: { id: true, destination: true, flowId: true },
  });
  if (!ticket || ticket.destination !== "MOTORISTAS") {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    // flowId pode chegar aqui antes do POST de criação ter voltado (corrida
    // rara): gravar não faz mal, é o mesmo id.
    data: { ...mirrorUpdate(state), flowId: ticket.flowId ?? flowId },
  });
  revalidatePath("/chamados");
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Rodar teste, tsc e lint**

Run: `npx tsx --test src/lib/flow/signature.test.ts && npx tsc --noEmit && npm run lint`
Expected: 5 testes ok; tsc e lint limpos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/flow/env.ts src/lib/flow/signature.ts src/lib/flow/signature.test.ts src/app/api/integracao src/middleware.ts
git commit -m "Flow: receptor do webhook com assinatura HMAC e janela de tempo"
```

---

### Task 4: Cliente HTTP, envio na abertura e reenvio por cron

**Files:**
- Create: `src/lib/flow/client.ts`
- Create: `src/lib/flow/payload.ts` (puro) + `src/lib/flow/payload.test.ts`
- Create: `src/lib/flow/sync.ts`
- Create: `src/app/api/cron/flow-sync/route.ts`
- Modify: `src/lib/tickets/actions.ts` (`listDrivers`, `isActiveDriver`, `createDriverTicket`)

**Interfaces:**
- Produces:
  - `payload.ts`: `buildCreatePayload(t: TicketForFlow, requester: { id; name; sector: string | null }): CreatePayload` onde `TicketForFlow` tem os campos do Ticket usados (`id, code, serviceType, description, contact, departureStreet/Number/District, destStreet/Number/District, assigneeFlowId?: string | null`) e `CreatePayload` é o JSON do `POST /chamados` do Flow.
  - `client.ts`: `listFlowDrivers(): Promise<{ id; name }[]>` (cache 60s em módulo; `[]` se Flow fora), `createFlowTransport(payload, images: { absolutePath: string; fileName: string }[]): Promise<{ id: string; status: string; driver: { id; name } | null }>`, `getFlowTransport(connectId): Promise<FlowTicketState & { id: string }> | null`, `fetchFlowTracking(connectId): Promise<Response>`, `fetchFlowProof(connectId): Promise<Response>`. Todas lançam `FlowUnavailableError` (classe exportada) em falha de rede/5xx/503.
  - `sync.ts`: `syncTicketToFlow(ticketId: string): Promise<void>` (grava `flowId` ou `flowSyncError`), `resyncPendingTickets(): Promise<{ sent: number; failed: number }>`, `reconcileTicket(ticketId): Promise<void>`.

- [ ] **Step 1: Teste do payload (falha primeiro)**

`src/lib/flow/payload.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildCreatePayload } from "./payload";

const ticket = {
  id: "t1", code: "MOT-014", serviceType: "Entrega", description: "Levar amostras", contact: "11 9999-0000",
  departureStreet: "Rua A", departureNumber: "10", departureDistrict: "Centro",
  destStreet: "Rua B", destNumber: null, destDistrict: "Bairro",
};

test("monta o payload no contrato do Flow", () => {
  const p = buildCreatePayload(ticket, { id: "u1", name: "Ana", sector: "Comercial" }, "drv-1");
  assert.equal(p.connectId, "t1");
  assert.equal(p.code, "MOT-014");
  assert.deepEqual(p.requester, { connectId: "u1", name: "Ana", sector: "Comercial" });
  assert.equal(p.originStreet, "Rua A");
  assert.equal(p.originNumber, "10");
  assert.equal(p.destStreet, "Rua B");
  assert.equal(p.destNumber, null);
  assert.equal(p.driverId, "drv-1");
});

test("sem motorista e sem setor: campos nulos, não undefined (JSON não perde a chave)", () => {
  const p = buildCreatePayload(ticket, { id: "u1", name: "Ana", sector: null }, null);
  assert.equal(p.driverId, null);
  assert.equal(p.requester.sector, null);
  assert.ok("driverId" in JSON.parse(JSON.stringify(p)));
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx tsx --test src/lib/flow/payload.test.ts`
Expected: módulo ausente.

- [ ] **Step 3: Implementar `payload.ts`**

`src/lib/flow/payload.ts`:

```ts
/**
 * Corpo do `POST /api/integracao/connect/chamados` do Flow, a partir do
 * Ticket gravado. Puro: testável sem banco. A partida sempre chega como
 * endereço (o Connect já copiou o endereço da unidade para o Ticket na
 * abertura), então `originUnit` não é usado.
 */
export interface TicketForFlow {
  id: string;
  code: string;
  serviceType: string | null;
  description: string | null;
  contact: string | null;
  departureStreet: string | null;
  departureNumber: string | null;
  departureDistrict: string | null;
  destStreet: string | null;
  destNumber: string | null;
  destDistrict: string | null;
}

export interface CreatePayload {
  connectId: string;
  code: string;
  requester: { connectId: string; name: string; sector: string | null };
  contact: string | null;
  serviceType: string;
  description: string;
  originStreet: string | null;
  originNumber: string | null;
  originDistrict: string | null;
  destStreet: string;
  destNumber: string | null;
  destDistrict: string | null;
  driverId: string | null;
}

export function buildCreatePayload(
  t: TicketForFlow,
  requester: { id: string; name: string; sector: string | null },
  driverId: string | null,
): CreatePayload {
  return {
    connectId: t.id,
    code: t.code,
    requester: { connectId: requester.id, name: requester.name, sector: requester.sector },
    contact: t.contact,
    serviceType: t.serviceType ?? "Transporte",
    description: t.description ?? t.code,
    originStreet: t.departureStreet,
    originNumber: t.departureNumber,
    originDistrict: t.departureDistrict,
    destStreet: t.destStreet ?? "Destino não informado",
    destNumber: t.destNumber,
    destDistrict: t.destDistrict,
    driverId,
  };
}
```

- [ ] **Step 4: Implementar `client.ts`**

`src/lib/flow/client.ts`:

```ts
import { readFile } from "node:fs/promises";
import { flowEnv } from "./env";
import { flowStateSchema, type FlowTicketState } from "./mirror";
import type { CreatePayload } from "./payload";

/**
 * Cliente HTTP do Build.Flow. Toda chamada leva o token de serviço; nenhuma
 * usa sessão de usuário. Falha de rede, 5xx ou 503 vira FlowUnavailableError
 * — quem chama decide se guarda para reenviar (abertura) ou degrada (lista de
 * motoristas, rastreamento).
 */
export class FlowUnavailableError extends Error {
  constructor(message = "Build.Flow indisponível.") {
    super(message);
    this.name = "FlowUnavailableError";
  }
}

const TIMEOUT_MS = 8_000;

async function flowFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const env = flowEnv();
  if (!env) throw new FlowUnavailableError("Integração com o Build.Flow não configurada.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${env.apiToken}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status >= 500) throw new FlowUnavailableError(`Build.Flow respondeu ${res.status}.`);
    return res;
  } catch (e) {
    if (e instanceof FlowUnavailableError) throw e;
    throw new FlowUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}

// ——— Motoristas (cache de 60s: o formulário abre muitas vezes) ———
const DRIVERS_TTL_MS = 60_000;
let driversCache: { at: number; list: { id: string; name: string }[] } | null = null;

export async function listFlowDrivers(): Promise<{ id: string; name: string }[]> {
  if (driversCache && Date.now() - driversCache.at < DRIVERS_TTL_MS) return driversCache.list;
  try {
    const res = await flowFetch("/api/integracao/connect/motoristas");
    if (!res.ok) return [];
    const data = (await res.json()) as { drivers?: { id: string; name: string }[] };
    const list = data.drivers ?? [];
    driversCache = { at: Date.now(), list };
    return list;
  } catch {
    // Flow fora: o formulário abre sem a opção de escolher motorista.
    return [];
  }
}

export async function isFlowDriver(id: string): Promise<boolean> {
  return (await listFlowDrivers()).some((d) => d.id === id);
}

// ——— Criação ———
export async function createFlowTransport(
  payload: CreatePayload,
  images: { absolutePath: string; fileName: string }[],
): Promise<{ id: string; status: string; driver: { id: string; name: string } | null }> {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  for (const img of images) {
    const bytes = await readFile(img.absolutePath);
    form.append("images", new Blob([bytes], { type: "image/webp" }), img.fileName);
  }
  const res = await flowFetch("/api/integracao/connect/chamados", { method: "POST", body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Build.Flow recusou o chamado (${res.status}).`);
  }
  return (await res.json()) as { id: string; status: string; driver: { id: string; name: string } | null };
}

// ——— Leitura ———
export async function getFlowTransport(connectId: string): Promise<(FlowTicketState & { id: string }) | null> {
  const res = await flowFetch(`/api/integracao/connect/chamados/${encodeURIComponent(connectId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new FlowUnavailableError(`Build.Flow respondeu ${res.status}.`);
  const raw = (await res.json()) as { id: string; driver: { name: string } | null } & Record<string, unknown>;
  const parsed = flowStateSchema.safeParse({ ...raw, driverName: raw.driver?.name ?? null });
  if (!parsed.success) throw new FlowUnavailableError("Resposta do Build.Flow fora do contrato.");
  return { ...parsed.data, id: raw.id };
}

export function fetchFlowTracking(connectId: string): Promise<Response> {
  return flowFetch(`/api/integracao/connect/chamados/${encodeURIComponent(connectId)}/rastreamento`);
}

export function fetchFlowProof(connectId: string): Promise<Response> {
  return flowFetch(`/api/integracao/connect/chamados/${encodeURIComponent(connectId)}/comprovante`);
}
```

- [ ] **Step 5: Implementar `sync.ts`**

`src/lib/flow/sync.ts`:

```ts
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { toAbsolutePath } from "@/lib/storage/config";
import { buildCreatePayload } from "./payload";
import { createFlowTransport, getFlowTransport, FlowUnavailableError } from "./client";
import { mirrorUpdate } from "./mirror";

/**
 * Envio e reconciliação do chamado de Motoristas com o Build.Flow.
 *
 * `syncTicketToFlow` roda logo após a gravação local. Se o Flow não responder,
 * o Ticket fica com `flowSyncError` e `resyncPendingTickets` (cron) tenta de
 * novo — o POST do Flow é idempotente por connectId, então repetir é seguro.
 */
export async function syncTicketToFlow(ticketId: string): Promise<void> {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, code: true, destination: true, flowId: true,
      serviceType: true, description: true, contact: true,
      departureStreet: true, departureNumber: true, departureDistrict: true,
      destStreet: true, destNumber: true, destDistrict: true,
      // Motorista escolhido na abertura (id do Flow), até o envio acontecer.
      flowDriverId: true,
      requester: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
      images: { orderBy: { order: "asc" }, select: { filePath: true } },
    },
  });
  if (!t || t.destination !== "MOTORISTAS" || t.flowId) return;

  const payload = buildCreatePayload(
    t,
    { id: t.requester.id, name: t.requester.fullName, sector: t.requester.sector?.label ?? null },
    t.flowDriverId,
  );
  const images = t.images.map((img, i) => ({
    absolutePath: toAbsolutePath(img.filePath),
    fileName: `${t.code}-${i + 1}.webp`,
  }));

  try {
    const created = await createFlowTransport(payload, images);
    await prisma.ticket.update({
      where: { id: t.id },
      data: {
        flowId: created.id,
        flowSyncedAt: new Date(),
        flowSyncError: null,
        externalAssigneeName: created.driver?.name ?? null,
        status: created.driver ? "ATRIBUIDO" : "PENDENTE",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao enviar ao Build.Flow.";
    await prisma.ticket.update({ where: { id: t.id }, data: { flowSyncError: msg } });
    if (!(e instanceof FlowUnavailableError)) console.error("[flow/sync] envio recusado:", e);
  }
}

/** Reenvia os que ainda não chegaram ao Flow. Chamado pelo cron. */
export async function resyncPendingTickets(): Promise<{ sent: number; failed: number }> {
  const pendentes = await prisma.ticket.findMany({
    where: { destination: "MOTORISTAS", flowId: null, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let sent = 0;
  let failed = 0;
  for (const p of pendentes) {
    await syncTicketToFlow(p.id);
    const after = await prisma.ticket.findUnique({ where: { id: p.id }, select: { flowId: true } });
    if (after?.flowId) sent += 1;
    else failed += 1;
  }
  if (sent + failed > 0) revalidatePath("/chamados");
  return { sent, failed };
}

/** Reconsulta o Flow e aplica o estado no espelho. Silencioso se o Flow estiver fora. */
export async function reconcileTicket(ticketId: string): Promise<void> {
  try {
    const state = await getFlowTransport(ticketId);
    if (!state) return;
    await prisma.ticket.update({ where: { id: ticketId }, data: mirrorUpdate(state) });
  } catch (e) {
    if (!(e instanceof FlowUnavailableError)) console.error("[flow/sync] reconciliação falhou:", e);
  }
}
```

- [ ] **Step 6: Cron de reenvio**

Copie a verificação de `CRON_SECRET` de `src/app/api/cron/evaluations/route.ts` (função `authorized(request)` — mesma comparação em tempo constante). `src/app/api/cron/flow-sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { resyncPendingTickets } from "@/lib/flow/sync";

/**
 * GET /api/cron/flow-sync — reenvia ao Build.Flow os chamados de Motoristas
 * que ainda não chegaram lá (Flow fora do ar na abertura). Agende a cada
 * minuto no EasyPanel:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/flow-sync
 * Mesma proteção da rota de avaliações.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return require("node:crypto").timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const result = await resyncPendingTickets();
  return NextResponse.json(result);
}
```

(Se `evaluations/route.ts` exportar a função de autorização, importe-a em vez de duplicar; se usar `import { timingSafeEqual } from "node:crypto"`, faça o mesmo — sem `require`.)

- [ ] **Step 7: Abertura passa a enviar ao Flow**

Em `src/lib/tickets/actions.ts`:

(a) `listDrivers` deixa de consultar usuários do Connect e passa a ler do Flow. Substitua o corpo:

```ts
export async function listDrivers(): Promise<DriverOption[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  // Os motoristas vivem no Build.Flow. Flow fora do ar = lista vazia, e o
  // chamado nasce Em Aberto (o campo continua opcional).
  return listFlowDrivers();
}
```

e `isActiveDriver`:

```ts
async function isActiveDriver(userId: string): Promise<boolean> {
  return isFlowDriver(userId);
}
```

Importe `import { listFlowDrivers, isFlowDriver } from "@/lib/flow/client";` e `import { syncTicketToFlow } from "@/lib/flow/sync";` e `import { flowEnv, FLOW_DISABLED_MESSAGE } from "@/lib/flow/env";`. Remova `DRIVER_SUBSECTOR_SLUG`/`DRIVER_SECTOR_SLUG` se ficarem sem uso (lint acusa).

(b) Em `createDriverTicket`, logo após a autenticação (`if (!user) ...`), recuse cedo sem configuração:

```ts
  // Sem o Flow configurado o chamado não teria para onde ir. Falha explícita.
  if (!flowEnv()) return { ok: false, error: FLOW_DISABLED_MESSAGE };
```

(c) Na criação do `Ticket` dentro da transação, troque o bloco `...(data.driverId ? { status: "ATRIBUIDO", assigneeId, assignedById } : { status: "PENDENTE" })` por:

```ts
          // O motorista é do Flow, não do Connect: nada de assigneeId. O id
          // escolhido fica em flowDriverId até o envio, que devolve o nome e o
          // status certos.
          status: "PENDENTE" as const,
          flowDriverId: data.driverId || null,
```

(d) Remova o `tx.notification.create({ kind: "CHAMADO_MOTORISTAS", ... })` — o quadro de Motoristas do Connect deixa de existir; a Logística é avisada no Flow.

(e) Após a transação e antes dos `revalidatePath`, envie:

```ts
    // Envia ao Flow AGORA. Falha não derruba a abertura: o Ticket fica marcado
    // e o cron /api/cron/flow-sync reenvia.
    await syncTicketToFlow(ticket.id);
```

- [ ] **Step 8: Testes, tsc, lint**

Run: `npx tsx --test src/lib/flow/payload.test.ts && npx tsc --noEmit && npm run lint`
Expected: 2 testes ok; tsc e lint limpos (remova imports/constantes que ficaram sem uso em `actions.ts`).

- [ ] **Step 9: Commit**

```bash
git add src/lib/flow src/app/api/cron/flow-sync src/lib/tickets/actions.ts
git commit -m "Chamados de Motoristas: abertura envia ao Build.Flow, motoristas vêm de lá, cron reenvia pendentes"
```

---

### Task 5: Meus Chamados, rastreamento e comprovante via Flow

**Files:**
- Modify: `src/lib/my-tickets-data.ts`
- Modify: `src/types/content.ts` (`Ticket`)
- Modify: `src/components/tickets/my-tickets-kanban.tsx` e `src/components/tickets/my-ticket-detail-modal.tsx`
- Modify: `src/app/api/chamados/[id]/tracking/route.ts`
- Create: `src/app/api/integracao/flow/comprovante/[ticketId]/route.ts`

- [ ] **Step 1: `Ticket` (UI) ganha dois campos**

Em `src/types/content.ts`, na interface `Ticket`, após `category?: string;`:

```ts
  /** Chamado de Motoristas ainda não chegou ao Build.Flow (reenvio automático). */
  flowSyncHint?: string;
  /** Comprovante de entrega (rota autenticada do Connect que busca no Flow). */
  proofUrl?: string;
```

- [ ] **Step 2: `getMyTickets` reconcilia e usa o nome do motorista do Flow**

Em `src/lib/my-tickets-data.ts`: importe `needsReconcile` de `@/lib/flow/mirror` e `reconcileTicket` de `@/lib/flow/sync`. No início de `getMyTickets`, antes do `findMany` principal:

```ts
  // Reconciliação na leitura: espelho velho de chamado de Motoristas não final
  // é reconsultado no Flow. É a rede de segurança do webhook (melhor esforço).
  const stale = await prisma.ticket.findMany({
    where: { requesterId: userId, destination: "MOTORISTAS", flowId: { not: null }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
    select: { id: true, destination: true, status: true, flowId: true, flowSyncedAt: true },
  });
  await Promise.all(stale.filter((t) => needsReconcile(t)).map((t) => reconcileTicket(t.id)));
```

No `tickets.push({...})`, troque `assignee: row.assignee?.fullName,` por:

```ts
      assignee: row.externalAssigneeName ?? row.assignee?.fullName,
      flowSyncHint:
        row.destination === "MOTORISTAS" && !row.flowId && row.flowSyncError
          ? "Aguardando envio à Logística"
          : undefined,
      proofUrl:
        row.destination === "MOTORISTAS" && row.flowId && row.status === "CONCLUIDO"
          ? `/api/integracao/flow/comprovante/${row.id}`
          : undefined,
```

- [ ] **Step 3: Mostrar na tela**

Em `my-tickets-kanban.tsx`, dentro do card, logo após o bloco `{ticket.assignee ? (...)}` (linha ~99), acrescente:

```tsx
          {ticket.flowSyncHint && (
            <p className="mt-1 text-[11px] text-warning">{ticket.flowSyncHint}</p>
          )}
```

Em `my-ticket-detail-modal.tsx`, na `<dl>` de detalhes, após o item "Responsável", acrescente:

```tsx
          {ticket.proofUrl && (
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted">Comprovante</dt>
              <dd className="mt-1">
                <a href={ticket.proofUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                  Ver comprovante de entrega
                </a>
              </dd>
            </div>
          )}
```

- [ ] **Step 4: Rota de rastreamento busca no Flow quando há `flowId`**

Em `src/app/api/chamados/[id]/tracking/route.ts`, no `select` do ticket inclua `flowId: true, destination: true`. No bloco `try`, antes de `const tracking = await getTripTracking(ticketId);`:

```ts
    // Chamado gerido no Build.Flow: o rastreamento vive lá. Mesmo DTO; o
    // mapa não sabe a diferença. Chamados antigos (sem flowId) seguem no Trip local.
    if (ticket.destination === "MOTORISTAS" && ticket.flowId) {
      const res = await fetchFlowTracking(ticketId);
      if (res.status === 404) {
        return NextResponse.json({ error: "Corrida não iniciada." }, { status: 404 });
      }
      const body = await res.text();
      return new NextResponse(body, {
        status: res.ok ? 200 : 502,
        headers: { "content-type": "application/json", "Cache-Control": "no-store" },
      });
    }
```

Importe `fetchFlowTracking` de `@/lib/flow/client`. Como `FlowUnavailableError` é lançada em falha, o `catch` existente já devolve 500 com a mensagem genérica — ok.

- [ ] **Step 5: Comprovante**

`src/app/api/integracao/flow/comprovante/[ticketId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { fetchFlowProof, FlowUnavailableError } from "@/lib/flow/client";
import type { Role } from "@/types";

/**
 * GET /api/integracao/flow/comprovante/[ticketId] — foto do comprovante de um
 * chamado gerido no Flow. Sessão do Connect na porta; token de serviço na
 * ida ao Flow. Mesma régua de acesso do rastreamento: solicitante, ou quem
 * tem o setor Motoristas.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const { ticketId } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { requesterId: true, flowId: true, destination: true },
  });
  if (!ticket || ticket.destination !== "MOTORISTAS" || !ticket.flowId) {
    return new Response("Not found", { status: 404 });
  }
  let liberado = ticket.requesterId === user.id;
  if (!liberado) {
    const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
    liberado = canAccessSlug(slugs, "motoristas");
  }
  if (!liberado) return new Response("Sem permissão", { status: 403 });

  try {
    const res = await fetchFlowProof(ticketId);
    if (!res.ok) return new Response("Not found", { status: 404 });
    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: { "content-type": "image/webp", "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    if (e instanceof FlowUnavailableError) return new Response("Logística indisponível", { status: 503 });
    throw e;
  }
}
```

- [ ] **Step 6: tsc + lint + testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/my-tickets-data.ts src/types/content.ts src/components/tickets "src/app/api/chamados/[id]/tracking/route.ts" src/app/api/integracao/flow/comprovante
git commit -m "Meus Chamados: reconcilia com o Flow na leitura; rastreamento e comprovante vêm do Flow"
```

---

### Task 6: Setor Motoristas sem Chamados e Dashboard; código de gestão removido

**Files:**
- Modify: `src/components/it/driver-sector-view.tsx` (abas e props)
- Modify: `src/app/setores/motoristas/page.tsx`
- Delete: `src/components/it/driver-kanban-board.tsx`, `src/components/it/driver-ticket-card.tsx`, `src/components/tracking/driver-trip-controller.tsx`, `src/lib/tracking/actions.ts`, `src/lib/tracking/geocode.ts`, `src/lib/tracking/use-position-broadcast.ts`, `src/lib/driver-data-db.ts`
- Modify: `src/app/api/chamados/board/route.ts` (ramo MOTORISTAS), `src/lib/tickets/history-actions.ts` (ramo MOTORISTAS), `src/lib/tickets/assign-actions.ts` (recusar MOTORISTAS), `src/lib/ticket-actions.ts` (remover `completeTicketWithProof`), `src/app/api/uploads/route.ts` (remover `chamado-comprovante`)
- Modify: `src/lib/it-data.ts` (comentário que cita `driver-data-db`)

- [ ] **Step 1: Abas do setor**

Em `driver-sector-view.tsx`: remova `{ id: "chamados", ... }` e `{ id: "dashboard", ... }` de `TABS`; remova as props `tickets`, `dashboard`, `logistics` (da interface e da desestruturação); troque `useState("chamados")` por `useState("documentos")`; apague os blocos `{active === "chamados" && ...}` e `{active === "dashboard" && ...}`; remova os imports de `DriverKanbanBoard`, `ItDashboard` e dos tipos `ItTicket`/`ItDashboardData`/`DriverLogistics` que ficarem sem uso. Atualize a descrição do `PageHeader` para `"Conteúdos e avaliações da equipe de rota. Os chamados são geridos no Build.Flow."`.

- [ ] **Step 2: Página do setor**

Em `src/app/setores/motoristas/page.tsx`: remova o import de `@/lib/driver-data-db` e as três chamadas (`getDriverTickets`, `getDriverDashboard`, `getDriverLogistics`) do `Promise.all`, e as props correspondentes passadas a `<DriverSectorView>`.

- [ ] **Step 3: Apagar o código de gestão**

Run:
```bash
git rm -q src/components/it/driver-kanban-board.tsx src/components/it/driver-ticket-card.tsx src/components/tracking/driver-trip-controller.tsx src/lib/tracking/actions.ts src/lib/tracking/geocode.ts src/lib/tracking/use-position-broadcast.ts src/lib/driver-data-db.ts
```

- [ ] **Step 4: Ramos MOTORISTAS que apontavam para o código apagado**

`src/app/api/chamados/board/route.ts`: apague o import de `getDriverTickets` e troque o ramo `if (destination === "MOTORISTAS") { ... }` por:

```ts
    if (destination === "MOTORISTAS") {
      // O quadro de Motoristas mudou para o Build.Flow.
      return NextResponse.json({ error: "Chamados de Motoristas são geridos no Build.Flow." }, { status: 410 });
    }
```

`src/lib/tickets/history-actions.ts`: apague o import de `getDriverTicketsHistory`; troque o ternário por `const tickets = await getItTicketsHistory();` e, antes, recuse `destination === "MOTORISTAS"` com `{ ok: false, tickets: [], error: "Chamados de Motoristas são geridos no Build.Flow." }`.

`src/lib/tickets/assign-actions.ts`: em `assignTicket` e `unassignTicket`, logo após carregar o ticket, acrescente:

```ts
    if (ticket.destination === "MOTORISTAS") {
      return { ok: false, error: "Chamados de Motoristas são atribuídos no Build.Flow." };
    }
```

Em `listAssignableUsers`, o ramo `destination === "MOTORISTAS"` passa a devolver `[]` (com comentário: motoristas vivem no Flow). Ajuste o comentário de cabeçalho que cita `lib/ticket-visibility` só se citar o quadro de motoristas.

`src/lib/ticket-actions.ts`: apague `completeTicketWithProof` inteira (e imports que ficarem sem uso — `processAndStoreImage`, `removeFile`, etc.). `src/app/api/uploads/route.ts`: remova a linha `"chamado-comprovante": completeTicketWithProof,` e o import.

`src/lib/it-data.ts:8`: remova a menção a `lib/driver-data-db` no comentário.

- [ ] **Step 5: Varredura**

Run: `grep -rn "driver-data-db\|driver-kanban-board\|driver-ticket-card\|driver-trip-controller\|tracking/actions\|use-position-broadcast\|tracking/geocode\|completeTicketWithProof\|chamado-comprovante\|CHAMADO_MOTORISTAS" src --include=*.ts --include=*.tsx`
Expected: só `src/types/notification.ts` e `prisma/schema.prisma` mantêm `CHAMADO_MOTORISTAS` (enum e rótulos de notificações antigas já gravadas — ficam).

- [ ] **Step 6: tsc + lint + testes + build**

Run: `npx tsc --noEmit && npm run lint && npm test && npx next build`
Expected: tudo limpo. Se `ticket-visibility.test.ts` ou `ticket-title.test.ts` referenciarem algo apagado, ajuste-os (ambos testam lógica compartilhada com TI e devem continuar passando).

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "Setor Motoristas: saem Chamados e Dashboard (geridos no Build.Flow); código de gestão e GPS removidos"
```

---

### Task 7: Configuração, documentação e verificação final

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md` ou `docs/` (se houver um lugar de referência de rotas/cron; senão, só o `.env.example`)

- [ ] **Step 1: `.env.example`**

Após o bloco `# ─── Cron de avaliações (opcional) ───`, acrescente:

```
# ─── Integração com o Build.Flow (chamados de Motoristas) ─────────────────
# O Flow é o dono dos chamados de Motoristas: o Connect abre e acompanha.
# Entre serviços do mesmo projeto do EasyPanel use o NOME DO SERVIÇO como host.
# Sem as três, abrir chamado de Motoristas é recusado com aviso.
FLOW_API_URL="http://buildflow:3000"
FLOW_API_TOKEN=""          # = CONNECT_INTEGRATION_TOKEN no Flow
FLOW_WEBHOOK_SECRET=""     # = CONNECT_WEBHOOK_SECRET no Flow
# O cron /api/cron/flow-sync (a cada minuto) reenvia chamados que não chegaram
# ao Flow. Usa o mesmo CRON_SECRET acima.
```

Remova `GEOCODE_USER_AGENT`, `GEOCODE_DEFAULT_CITY`, `GEOCODE_DEFAULT_STATE` (a geocodificação saiu do Connect).

- [ ] **Step 2: Teste ponta a ponta local (Flow em :3000, Connect em :3001)**

No `.env` local do Connect: `FLOW_API_URL=http://localhost:3000`, `FLOW_API_TOKEN=dev-token-connect`, `FLOW_WEBHOOK_SECRET=dev-webhook-secret` (os mesmos valores de dev do Flow, cujo `CONNECT_WEBHOOK_URL` já aponta para `http://localhost:3001`). Suba os dois (`npm run dev` no Flow; `npx next dev -p 3001` no Connect). Roteiro:
1. No Connect, abrir um chamado de Motoristas (com foto) → "Meus Chamados" mostra em Aberto; no Flow, `/motorista/chamados` mostra o card com a foto.
2. No Flow (GESTAO), atribuir → no Connect o card mostra o nome do motorista em até 60s (webhook imediato; reconciliação como reserva).
3. No Flow (MOTORISTA), iniciar rota (permitir localização) → no Connect o modal do chamado mostra o mapa com a posição.
4. No Flow, concluir com foto → no Connect: Resolvido, link "Ver comprovante" abre a imagem.
5. Derrubar o Flow, abrir outro chamado no Connect → card com "Aguardando envio à Logística"; subir o Flow e chamar `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/flow-sync` → `{"sent":1,"failed":0}` e o aviso some.

- [ ] **Step 3: Verificação final**

Run: `npm run lint && npx tsc --noEmit && npm test && npx next build`
Expected: tudo limpo.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "Docs: variáveis da integração com o Build.Flow e cron de reenvio"
```
