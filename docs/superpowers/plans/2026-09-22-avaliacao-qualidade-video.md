# Avaliação da qualidade do vídeo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depois de enviar a resposta de compreensão, o colaborador avalia o vídeo em áudio, imagem e clareza (estrelas de 1 a 5, tudo opcional), e a avaliação fica guardada para o Gestor ler no módulo Meu Setor.

**Architecture:** Tabela `VideoRating`, uma por pessoa por vídeo, com os três critérios nulos quando não avaliados. A interface **não abre janela nova**: o painel já aberto dentro do player troca de conteúdo quando a resposta é registrada. Toda decisão de "isto está vazio?" e "qual a média?" mora num módulo puro testado sem banco.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma 6 + PostgreSQL, React 18, Tailwind, `node:test` via `tsx`.

**Spec:** [docs/superpowers/specs/2026-09-22-avaliacao-qualidade-video-design.md](../specs/2026-09-22-avaliacao-qualidade-video-design.md)

## Global Constraints

- Estrelas de **1 a 5**; os três critérios e o comentário são **opcionais**.
- **Não marcar nada não grava nada** — nenhuma linha vazia no banco.
- Uma avaliação por pessoa por vídeo; reavaliar **substitui**.
- Média nula quando não há valor: `null` e `0` são coisas diferentes, e exibir `0,0` para "ninguém avaliou" mentiria sobre o vídeo.
- **Sem overlay sobre overlay**: nenhuma janela nova sobre o player.
- Avaliar nunca vira obrigação: "Pular" e o envio levam ao mesmo estado final.
- Só onde a compreensão existe (`hasComprehension`): vitrines não avaliam.
- Comentário: máximo 1000 caracteres.
- Cor nunca é o único sinal (WCAG 1.4.1); cada estrela alcançável por teclado.
- Cada commit deixa `npm run typecheck`, `npm run lint` e `npm test` verdes.
- Comentários e mensagens de commit em português.

---

## Estrutura de arquivos

**Criar:**
- `src/lib/video-rating.ts` — constantes, critérios e as duas regras puras.
- `src/lib/video-rating.test.ts`
- `src/lib/video-rating-actions.ts` — a Server Action.
- `src/lib/video-rating.dbtest.ts`
- `prisma/migrations/20260922120000_video_rating/migration.sql`
- `src/components/sector/video-rating-form.tsx` — as estrelas e o comentário.

**Modificar:**
- `prisma/schema.prisma` — model `VideoRating` e relações em `User` e `Video`.
- `src/components/sector/video-modal.tsx` — o bloco `answered` passa a hospedar o formulário.

---

### Task 1: Regras puras da avaliação

**Files:**
- Create: `src/lib/video-rating.ts`
- Test: `src/lib/video-rating.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `RATING_MIN = 1`, `RATING_MAX = 5`, `RATING_COMMENT_MAX = 1000`, `RATING_CRITERIA`, `isEmptyRating(input): boolean`, `averageOf(values: readonly (number | null)[]): number | null`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/video-rating.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  RATING_MIN,
  RATING_MAX,
  RATING_CRITERIA,
  averageOf,
  isEmptyRating,
} from "./video-rating";

test("a escala vai de 1 a 5 e há três critérios", () => {
  assert.equal(RATING_MIN, 1);
  assert.equal(RATING_MAX, 5);
  assert.deepEqual(
    RATING_CRITERIA.map((c) => c.key),
    ["audio", "image", "clarity"],
  );
});

test("avaliação vazia é a que não grava nada", () => {
  assert.equal(isEmptyRating({ audio: null, image: null, clarity: null }), true);
  assert.equal(isEmptyRating({ audio: null, image: null, clarity: null, comment: "" }), true);
  // Só espaços continua sendo vazio: senão o banco guarda uma linha em branco.
  assert.equal(isEmptyRating({ audio: null, image: null, clarity: null, comment: "   " }), true);
});

test("um único critério já torna a avaliação real", () => {
  assert.equal(isEmptyRating({ audio: 3, image: null, clarity: null }), false);
  assert.equal(isEmptyRating({ audio: null, image: null, clarity: 1 }), false);
});

test("só comentário também é avaliação", () => {
  assert.equal(
    isEmptyRating({ audio: null, image: null, clarity: null, comment: "som baixo" }),
    false,
  );
});

test("a média ignora os nulos e não os conta no denominador", () => {
  assert.equal(averageOf([5, 4]), 4.5);
  assert.equal(averageOf([5, null, 4]), 4.5);
  assert.equal(averageOf([4, 4, 5]), 4.3);
});

test("sem nenhum valor não há média — e isso não é zero", () => {
  assert.equal(averageOf([]), null);
  assert.equal(averageOf([null, null]), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx --test src/lib/video-rating.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Implementar**

Criar `src/lib/video-rating.ts`:

```ts
/**
 * Avaliação que o COLABORADOR dá AO VÍDEO — não confundir com a nota de
 * compreensão, que é o Gestor avaliando o colaborador. Esta não entra em
 * média de desempenho nenhuma; serve para descobrir qual vídeo precisa ser
 * refeito.
 *
 * Puro de propósito: a interface e a leitura do Gestor usam as mesmas regras,
 * testadas sem banco.
 */

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const RATING_COMMENT_MAX = 1000;

/** Os critérios, na ordem em que aparecem na tela. */
export const RATING_CRITERIA = [
  { key: "audio", label: "Qualidade do áudio" },
  { key: "image", label: "Qualidade da imagem" },
  { key: "clarity", label: "Clareza das instruções" },
] as const;

export type RatingCriterion = (typeof RATING_CRITERIA)[number]["key"];

export interface RatingInput {
  audio: number | null;
  image: number | null;
  clarity: number | null;
  comment?: string | null;
}

/**
 * Nada marcado e nada escrito. "Opcional" tem que significar ausência: uma
 * linha com três nulos contaria como avaliação e estragaria o denominador.
 */
export function isEmptyRating(input: RatingInput): boolean {
  const noStars = input.audio == null && input.image == null && input.clarity == null;
  return noStars && !input.comment?.trim();
}

/**
 * Média de uma casa decimal. NULA quando não há valor algum — exibir 0,0 para
 * "ninguém avaliou" diria que o vídeo é péssimo, que é o contrário de não
 * saber.
 */
export function averageOf(values: readonly (number | null)[]): number | null {
  const given = values.filter((v): v is number => v != null);
  if (given.length === 0) return null;
  return Math.round((given.reduce((a, v) => a + v, 0) / given.length) * 10) / 10;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx tsx --test src/lib/video-rating.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-rating.ts src/lib/video-rating.test.ts
git commit -m "Avaliação de vídeo: critérios, avaliação vazia e média que aceita ausência"
```

---

### Task 2: Schema e migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260922120000_video_rating/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `prisma.videoRating` com `{ id, userId, videoId, audio, image, clarity, comment, createdAt, updatedAt }` e unique `[userId, videoId]`.

- [ ] **Step 1: Editar o schema**

Acrescentar o model, logo após `VideoComprehension`:

```prisma
/// Opinião do colaborador SOBRE O VÍDEO (não sobre ele mesmo). Uma por pessoa
/// por vídeo; reavaliar substitui. Nada aqui entra em média de desempenho —
/// quem lê é o Gestor, para saber qual vídeo precisa ser refeito.
model VideoRating {
  id      String @id @default(cuid())
  userId  String
  user    User   @relation("VideoRatingAuthor", fields: [userId], references: [id], onDelete: Cascade)
  videoId String
  video   Video  @relation(fields: [videoId], references: [id], onDelete: Cascade)

  /// 1 a 5. Nulo = o critério não foi avaliado; não conta na média.
  audio   Int?
  image   Int?
  clarity Int?

  comment   String?  @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, videoId])
  @@index([videoId])
}
```

Em `model User`, junto das outras relações de compreensão:

```prisma
  // Avaliações de qualidade que este usuário deu a vídeos.
  videoRatings VideoRating[] @relation("VideoRatingAuthor")
```

Em `model Video`, junto de `comprehensions`:

```prisma
  ratings VideoRating[]
```

- [ ] **Step 2: Escrever a migration à mão**

Criar `prisma/migrations/20260922120000_video_rating/migration.sql`:

```sql
-- Avaliação da qualidade do vídeo pelo colaborador. Os três critérios são
-- opcionais e independentes: quem avaliou só o áudio conta na média de áudio
-- e em mais nenhuma. Por isso nulo, e não zero.
CREATE TABLE "VideoRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "audio" INTEGER,
    "image" INTEGER,
    "clarity" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VideoRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoRating_userId_videoId_key" ON "VideoRating"("userId", "videoId");
CREATE INDEX "VideoRating_videoId_idx" ON "VideoRating"("videoId");

ALTER TABLE "VideoRating" ADD CONSTRAINT "VideoRating_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoRating" ADD CONSTRAINT "VideoRating_videoId_fkey"
  FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Aplicar e gerar o client**

Run: `npx prisma validate && npx prisma migrate deploy && npm run db:generate`
Expected: "All migrations have been successfully applied." Se aparecer **P3005** ("The database schema is not empty"), o banco está sem a tabela `_prisma_migrations`: rode o baseline antes —
`for m in $(ls prisma/migrations | grep -v migration_lock | grep -v 20260922120000); do npx prisma migrate resolve --applied "$m"; done` — e repita o `migrate deploy`.

- [ ] **Step 4: Conferir**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260922120000_video_rating
git commit -m "Avaliação de vídeo: tabela VideoRating, uma por pessoa por vídeo"
```

---

### Task 3: Server Action

**Files:**
- Create: `src/lib/video-rating-actions.ts`
- Test: `src/lib/video-rating.dbtest.ts`

**Interfaces:**
- Consumes: `isEmptyRating`, `RATING_MIN`, `RATING_MAX`, `RATING_COMMENT_MAX` (Task 1); `prisma.videoRating` (Task 2); `hasComprehension` de `@/lib/video-comprehension`.
- Produces: `submitVideoRating(input: { videoId: string; audio: number | null; image: number | null; clarity: number | null; comment?: string }): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Escrever o teste de banco que falha**

Criar `src/lib/video-rating.dbtest.ts`:

```ts
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";

/**
 * A avaliação contra o Postgres: uma linha por pessoa por vídeo, reavaliar
 * substitui, e excluir o vídeo leva a avaliação junto.
 */

const MARK = "#RATING";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let userId = "";
let videoId = "";
let subsectorId = "";
let sectorId = "";

before(async () => {
  const sector = await prisma.sector.create({
    data: { slug: `rt-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = sector.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `rtsub-${stamp()}`,
      label: `Sub ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 1,
      sectorId,
    },
    select: { id: true },
  });
  subsectorId = sub.id;

  const user = await prisma.user.create({
    data: {
      username: `rt-${stamp()}${MARK}`,
      fullName: `Pessoa ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  userId = user.id;

  const video = await prisma.video.create({
    data: { title: `Vídeo ${MARK}`, kind: "INSTRUCAO", subsectorId, filePath: "/uploads/x.mp4" },
    select: { id: true },
  });
  videoId = video.id;
});

after(async () => {
  await prisma.videoRating.deleteMany({ where: { userId } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("critério não avaliado fica nulo, não zero", async () => {
  await prisma.videoRating.create({
    data: { userId, videoId, audio: 4, image: null, clarity: null },
  });
  const row = await prisma.videoRating.findUnique({
    where: { userId_videoId: { userId, videoId } },
    select: { audio: true, image: true, clarity: true },
  });
  assert.equal(row?.audio, 4);
  assert.equal(row?.image, null);
  assert.equal(row?.clarity, null);
});

test("reavaliar substitui, sem criar segunda linha", async () => {
  await prisma.videoRating.upsert({
    where: { userId_videoId: { userId, videoId } },
    create: { userId, videoId, audio: 2, image: 2, clarity: 2 },
    update: { audio: 2, image: 2, clarity: 2, comment: "revisto" },
  });
  const rows = await prisma.videoRating.findMany({ where: { userId, videoId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].audio, 2);
  assert.equal(rows[0].comment, "revisto");
});

test("excluir o vídeo leva a avaliação junto", async () => {
  const temp = await prisma.video.create({
    data: { title: `Temp ${MARK}`, kind: "INSTRUCAO", subsectorId },
    select: { id: true },
  });
  await prisma.videoRating.create({ data: { userId, videoId: temp.id, audio: 5, image: null, clarity: null } });
  await prisma.video.delete({ where: { id: temp.id } });
  const left = await prisma.videoRating.count({ where: { videoId: temp.id } });
  assert.equal(left, 0);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx --test --test-concurrency=1 src/lib/video-rating.dbtest.ts`
Expected: FAIL enquanto a Task 2 não estiver aplicada; com ela aplicada, PASS.

- [ ] **Step 3: Escrever a action**

Criar `src/lib/video-rating-actions.ts`:

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { hasComprehension } from "@/lib/video-comprehension";
import {
  RATING_COMMENT_MAX,
  RATING_MAX,
  RATING_MIN,
  isEmptyRating,
} from "@/lib/video-rating";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const star = z.number().int().min(RATING_MIN).max(RATING_MAX).nullable();

const schema = z.object({
  videoId: z.string().min(1),
  audio: star,
  image: star,
  clarity: star,
  comment: z.string().trim().max(RATING_COMMENT_MAX).optional(),
});

/**
 * Avaliação da qualidade do vídeo pelo colaborador, no fim do fluxo de
 * resposta. Tudo opcional: pular é um caminho legítimo, e pular não grava.
 */
export async function submitVideoRating(input: {
  videoId: string;
  audio: number | null;
  image: number | null;
  clarity: number | null;
  comment?: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `Use notas de ${RATING_MIN} a ${RATING_MAX}.` };
  }
  const { videoId, audio, image, clarity, comment } = parsed.data;

  // Nada marcado e nada escrito: sucesso sem gravar. O botão "Pular" passa por
  // aqui, e uma linha vazia estragaria o denominador das médias.
  if (isEmptyRating({ audio, image, clarity, comment })) return { ok: true };

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { kind: true, subsector: { select: { kind: true } } },
  });
  if (!video) return { ok: false, error: "Vídeo não encontrado." };
  if (!hasComprehension(video)) {
    return { ok: false, error: "Este vídeo não recebe avaliação." };
  }

  // O formulário só existe depois da resposta; sem ela, a chamada não veio do
  // fluxo.
  const answered = await prisma.videoComprehension.findFirst({
    where: { userId: user.id, videoId },
    select: { id: true },
  });
  if (!answered) {
    return { ok: false, error: "Responda à pergunta do vídeo antes de avaliar." };
  }

  try {
    const data = { audio, image, clarity, comment: comment ? comment : null };
    await prisma.videoRating.upsert({
      where: { userId_videoId: { userId: user.id, videoId } },
      create: { userId: user.id, videoId, ...data },
      update: data,
    });
    return { ok: true };
  } catch (error) {
    console.error("[submitVideoRating] falha:", error);
    return { ok: false, error: "Não foi possível enviar sua avaliação." };
  }
}
```

- [ ] **Step 4: Rodar tudo**

Run: `npm run typecheck && npm run lint && npx tsx --test --test-concurrency=1 src/lib/video-rating.dbtest.ts`
Expected: PASS em todos (3 testes de banco).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-rating-actions.ts src/lib/video-rating.dbtest.ts
git commit -m "Avaliação de vídeo: Server Action que exige a resposta e não grava avaliação vazia"
```

---

### Task 4: O formulário de estrelas

**Files:**
- Create: `src/components/sector/video-rating-form.tsx`

**Interfaces:**
- Consumes: `RATING_CRITERIA`, `RATING_MAX`, `RATING_COMMENT_MAX`, `RatingCriterion` (Task 1); `submitVideoRating` (Task 3).
- Produces: `<VideoRatingForm videoId={string} onDone={() => void} />`.

- [ ] **Step 1: Escrever o componente**

Criar `src/components/sector/video-rating-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitVideoRating } from "@/lib/video-rating-actions";
import {
  RATING_COMMENT_MAX,
  RATING_CRITERIA,
  RATING_MAX,
  RATING_MIN,
  type RatingCriterion,
} from "@/lib/video-rating";

/**
 * Avaliação da qualidade do vídeo, exibida assim que a resposta de compreensão
 * é registrada — DENTRO do painel que já está aberto, nunca numa janela nova:
 * dois overlays brigam pelo ESC e pela trava de rolagem (ver `video-modal`).
 *
 * Tudo é opcional. "Pular" e "Enviar" levam ao mesmo lugar: avaliar não pode
 * virar obrigação disfarçada no fim do fluxo.
 */
export function VideoRatingForm({
  videoId,
  onDone,
}: {
  videoId: string;
  onDone: () => void;
}) {
  const [stars, setStars] = useState<Record<RatingCriterion, number | null>>({
    audio: null,
    image: null,
    clarity: null,
  });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await submitVideoRating({
        videoId,
        audio: stars.audio,
        image: stars.image,
        clarity: stars.clarity,
        comment: comment.trim() || undefined,
      });
      if (res.ok) onDone();
      else setError(res.error ?? "Não foi possível enviar sua avaliação.");
    });
  }

  return (
    <section aria-label="Avaliação do vídeo" className="mt-3">
      <h4 className="text-sm font-semibold text-foreground">Como foi esse vídeo para você?</h4>
      <p className="mt-0.5 text-xs text-muted">
        Opcional — ajuda o gestor a saber qual conteúdo precisa ser melhorado.
      </p>

      <div className="mt-3 space-y-2.5">
        {RATING_CRITERIA.map((criterion) => (
          <div key={criterion.key} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-foreground">{criterion.label}</span>
            <div role="radiogroup" aria-label={criterion.label} className="flex gap-1">
              {Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => i + RATING_MIN).map(
                (value) => {
                  const active = (stars[criterion.key] ?? 0) >= value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={stars[criterion.key] === value}
                      aria-label={`${criterion.label}: ${value} de ${RATING_MAX}`}
                      disabled={pending}
                      onClick={() =>
                        setStars((s) => ({
                          ...s,
                          // Clicar na estrela já marcada desmarca: dá para
                          // voltar a "não avaliei".
                          [criterion.key]: s[criterion.key] === value ? null : value,
                        }))
                      }
                      className="focus-ring rounded p-0.5"
                    >
                      <Star
                        className={cn(
                          "h-4 w-4 transition-colors",
                          active ? "fill-warning text-warning" : "text-muted",
                        )}
                      />
                    </button>
                  );
                },
              )}
            </div>
          </div>
        ))}
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={RATING_COMMENT_MAX}
        rows={2}
        placeholder="Quer comentar algo sobre o vídeo? (opcional)"
        className="mt-3"
        disabled={pending}
      />

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Pular
        </Button>
        <Button onClick={send} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
          Enviar avaliação
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Conferir**

Run: `npm run typecheck && npx eslint src/components/sector/video-rating-form.tsx`
Expected: PASS. Se o Tailwind não tiver `fill-warning`, confira o token em `tailwind.config.ts` e use o equivalente — não introduzir cor fora da paleta.

- [ ] **Step 3: Commit**

```bash
git add src/components/sector/video-rating-form.tsx
git commit -m "Avaliação de vídeo: formulário de estrelas com os três critérios opcionais"
```

---

### Task 5: Encaixar no player

**Files:**
- Modify: `src/components/sector/video-modal.tsx` (bloco `answered`, ~linha 257)

**Interfaces:**
- Consumes: `VideoRatingForm` (Task 4).
- Produces: nada consumido adiante.

- [ ] **Step 1: Trocar o bloco `answered`**

Acrescentar o import no topo do arquivo, junto de `ComprehensionForm`:

```tsx
import { VideoRatingForm } from "./video-rating-form";
```

Acrescentar o estado, junto de `const [answered, setAnswered] = useState(false);`:

```tsx
  // Avaliação do vídeo: aparece assim que a resposta é registrada e sai ao
  // enviar ou pular.
  const [rating, setRating] = useState(false);
```

No `onSubmitted` do `ComprehensionForm`, acender o formulário:

```tsx
                  onSubmitted={() => {
                    changed.current = true;
                    setAnswered(true);
                    setAsking(false);
                    setRating(true);
                  }}
```

Substituir o bloco `{answered && (...)}` inteiro por:

```tsx
            {answered && (
              <div className="mt-4 rounded-xl border border-primary/25 bg-primary/10 p-3">
                <p className="inline-flex items-center gap-1.5 text-xs text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resposta enviada — vídeo concluído. O
                  gestor do seu setor vai avaliar.
                </p>
                {rating && (
                  <VideoRatingForm videoId={video.id} onDone={() => setRating(false)} />
                )}
              </div>
            )}
```

- [ ] **Step 2: Conferir**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS em todos.

- [ ] **Step 3: Conferir na tela**

Assistir a uma Instrução em Vídeo até o fim, responder à pergunta. Esperado: a confirmação aparece e, abaixo dela, as três linhas de estrelas — **sem janela nova sobre o player**. Marcar algumas estrelas e enviar deixa só a confirmação; "Pular" faz o mesmo. Clicar de novo na estrela já marcada a desmarca. `Tab` alcança cada estrela e o leitor de tela anuncia "Qualidade do áudio: 3 de 5".

- [ ] **Step 4: Commit**

```bash
git add src/components/sector/video-modal.tsx
git commit -m "Player: a avaliação do vídeo aparece ao registrar a resposta, no painel já aberto"
```

---

## Verificação final

- [ ] `npm run typecheck && npm run lint && npm test` verdes.
- [ ] `npx tsx --test --test-concurrency=1 "src/**/*.dbtest.ts"` verde.
- [ ] `npm run build` passa.
- [ ] Fluxo na tela: responder → estrelas aparecem no mesmo painel → enviar grava uma linha; responder em outro vídeo e pular não grava nada.
