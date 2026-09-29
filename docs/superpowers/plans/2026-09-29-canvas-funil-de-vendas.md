# Canvas Funil de Vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em Comercial > Vendas (e Marketing) uma ferramenta que calcula quantas prospecções são necessárias para bater uma meta de faturamento, a partir do canvas impresso "Canvas Funil de Vendas".

**Architecture:** Um motor de cálculo puro (`src/lib/sales-funnel/math.ts`) sem Prisma e sem React, consumido igual no servidor e no cliente; cinco modelos novos no Prisma pendurados no subsetor de escopo (a mesma base compartilhada Vendas→Marketing que o Cronograma já usa); e uma aba nova na página de setor, no molde do painel do Cronograma. Dinheiro vive como `Decimal(14,2)` no banco e como centavos inteiros no motor.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 18, Prisma 6 + PostgreSQL, Zod 3, Tailwind, `node:test` via `tsx`.

**Spec:** [docs/superpowers/specs/2026-09-29-canvas-funil-de-vendas-design.md](../specs/2026-09-29-canvas-funil-de-vendas-design.md)

## Global Constraints

- **Dinheiro nunca é `Float`.** Banco: `Decimal(14,2)`. Motor: centavos como inteiro. UI: formata de volta para R$.
- **Taxas são `Float` em porcento**, domínio válido `(0, 100]`.
- **Nada em `src/lib/sales-funnel/` importa de `src/lib/funnel.ts`**, e vice-versa. São dois funis diferentes (conteúdo × comercial).
- **Guardas moram em módulo sem `"use server"`.** Exportar guarda de dentro de um arquivo de actions a transformaria em endpoint chamável pelo navegador.
- **Condicional de papel deriva de `can(role, permission)`** — nunca `role === "GESTOR"` no componente.
- **Ascendente arredonda para cima (`Math.ceil`); descendente para baixo (`Math.floor`).**
- **Etapas: mínimo 3, máximo 6.** Canais: mínimo 5 é *aviso*, não trava.
- Permissão nova: `funnel.manage` — `GESTOR` e `ADMIN`.
- Flag nova: `Subsector.funnelEnabled`, no molde exato de `scheduleEnabled`.
- Rodar teste puro: `npx tsx --test src/lib/sales-funnel/math.test.ts`. Suíte inteira: `npm test`. Banco: `npm run test:db`.
- Mensagem de commit em português, no estilo do repositório (`Funil de Vendas: <o que mudou>`), terminando com:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Review Focus

Cinco entradas que a spec implica mas que nenhum teste óbvio exercita, e que machucariam quem usa. Cada uma ganha teste na task que é dona do código.

1. **Valor monetário digitado no formato brasileiro** (`"50.000,00"`, `"1.234,5"`, `"R$ 50000"`). O usuário vai digitar com vírgula. Se o parser fizer `Number("50.000,00")` recebe `NaN` e a tela mostra meta zerada sem dizer por quê. → Task 1.
2. **Ticket maior que a meta.** Meta R$ 500, ticket R$ 1.000 ⇒ `ceil(0,5)` = **1 conversão**, nunca 0. Zero conversões faria o funil inteiro colapsar para zero e parecer um plano válido. → Task 1.
3. **Cenário com `ticketPercent` = −100.** Zera o ticket e provoca divisão por zero dentro do cenário. O cenário tem de devolver `TICKET_INVALIDO` como qualquer entrada ruim, não `Infinity`. → Task 4.
4. **Volume astronômico.** Meta alta com taxa de 0,01% produz bilhões de prospecções — número que não é plano, é erro de digitação. Precisa de teto (`VOLUME_IRREAL`) antes de virar um card ilegível. → Task 1.
5. **Fatia de canal negativa ou acima de 100.** `share: -20` derrubaria a cobertura para baixo e "consertaria" um estouro por acidente. → Task 3.

---

## Task 1: Motor — tipos, conversões necessárias e sentido ascendente

**Files:**
- Create: `src/lib/sales-funnel/types.ts`
- Create: `src/lib/sales-funnel/math.ts`
- Create: `src/lib/sales-funnel/math.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `FunnelInput`, `StageInput`, `ChannelInput`, `FunnelResult`, `StageVolume`, `ChannelVolume`, `Diagnostic`, `DiagnosticCode`, `LIMITE_VOLUME`; `parseMoedaParaCentavos(texto: string): number | null`; `conversoesNecessarias(goalCents: number, ticketCents: number): number`; `calcularAscendente(input: FunnelInput): FunnelResult`.

- [ ] **Step 1: Escrever os tipos**

`src/lib/sales-funnel/types.ts`:

```ts
/**
 * Domínio do Funil de Vendas (planejamento comercial).
 *
 * NÃO confundir com `src/lib/funnel.ts`, que classifica CONTEÚDO em
 * TOFU/MOFU/BOFU. Aqui se mede volume comercial: quantas oportunidades
 * precisam entrar para que a meta de faturamento seja batida.
 *
 * Dinheiro trafega como CENTAVOS INTEIROS. Float não guarda dinheiro: uma
 * meta de R$ 50.000,00 vira 49999.99999999999 e o erro entra direto na
 * divisão que define as conversões.
 */

export type DiagnosticCode =
  | "META_INVALIDA"
  | "TICKET_INVALIDO"
  | "SEM_ETAPAS"
  | "TAXA_INVALIDA"
  | "VOLUME_IRREAL"
  | "CANAIS_INSUFICIENTES"
  | "FATIA_INVALIDA"
  | "COBERTURA_INCOMPLETA"
  | "COBERTURA_EXCEDIDA";

/**
 * "erro" impede o cálculo — a tela diz o que falta preencher.
 * "aviso" calcula assim mesmo e mostra o alerta ao lado do número.
 */
export type DiagnosticSeverity = "erro" | "aviso";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  /** Id da etapa ou do canal a que o diagnóstico se refere, quando há um. */
  targetId?: string;
  /** Texto pronto para a tela. O componente não monta frase. */
  message: string;
}

export interface StageInput {
  id: string;
  label: string;
  /** Taxa DESTA etapa para a seguinte, em %. A última converte em negócio ganho. */
  rate: number;
}

export interface ChannelInput {
  id: string;
  label: string;
  /** Fatia do topo do funil que este canal responde, em %. */
  share: number;
}

export interface FunnelInput {
  goalCents: number;
  ticketCents: number;
  stages: readonly StageInput[];
  channels: readonly ChannelInput[];
}

export interface StageVolume {
  id: string;
  label: string;
  rate: number;
  /** Quantas oportunidades precisam ENTRAR nesta etapa. */
  volume: number;
}

export interface ChannelVolume {
  id: string;
  label: string;
  share: number;
  /** Fatia traduzida em número absoluto de prospecções. */
  volume: number;
}

export interface FunnelResult {
  requiredConversions: number;
  stages: readonly StageVolume[];
  /** Volume da primeira etapa: a boca do funil. */
  topVolume: number;
  /** requiredConversions / topVolume, em %. Zero quando não há cálculo. */
  externalRate: number;
  projectedRevenueCents: number;
  channels: readonly ChannelVolume[];
  /** Soma das fatias dos canais, em %. */
  channelCoverage: number;
  diagnostics: readonly Diagnostic[];
}
```

- [ ] **Step 2: Escrever os testes que falham**

`src/lib/sales-funnel/math.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  LIMITE_VOLUME,
  calcularAscendente,
  conversoesNecessarias,
  parseMoedaParaCentavos,
} from "./math";
import type { FunnelInput } from "./types";

/**
 * O motor do Funil de Vendas. Estes testes são a régua do canvas impresso:
 * o exemplo da folha (R$ 50.000 / ticket R$ 1.000 / 20-50-50) tem de dar
 * exatamente 1.000 oportunidades no topo.
 */

/** Plano do exemplo impresso, para os testes não repetirem a montagem. */
function planoDoCanvas(): FunnelInput {
  return {
    goalCents: 5_000_000, // R$ 50.000,00
    ticketCents: 100_000, // R$ 1.000,00
    stages: [
      { id: "s1", label: "Oportunidades", rate: 50 },
      { id: "s2", label: "Visita", rate: 50 },
      { id: "s3", label: "Proposta", rate: 20 },
    ],
    channels: [],
  };
}

test("o exemplo do canvas impresso fecha em 50 conversões e 1.000 oportunidades", () => {
  const r = calcularAscendente(planoDoCanvas());
  assert.equal(r.requiredConversions, 50);
  assert.deepEqual(
    r.stages.map((s) => s.volume),
    [1000, 500, 250],
  );
  assert.equal(r.topVolume, 1000);
  assert.equal(r.externalRate, 5);
  assert.equal(r.projectedRevenueCents, 5_000_000);
  assert.deepEqual(r.diagnostics, []);
});

test("ascendente arredonda para CIMA: 249,3 propostas viram 250", () => {
  // 37 conversões a 20% = 185 propostas exatas; a 18% = 205,55 -> 206.
  const r = calcularAscendente({
    ...planoDoCanvas(),
    goalCents: 3_700_000,
    stages: [{ id: "s1", label: "Proposta", rate: 18 }],
  });
  assert.equal(r.requiredConversions, 37);
  assert.equal(r.stages[0]?.volume, 206);
});

test("ticket MAIOR que a meta ainda exige uma conversão, nunca zero", () => {
  assert.equal(conversoesNecessarias(50_000, 100_000), 1);
});

test("meta zerada e ticket zerado viram erro, sem volume calculado", () => {
  const semTicket = calcularAscendente({ ...planoDoCanvas(), ticketCents: 0 });
  assert.equal(semTicket.requiredConversions, 0);
  assert.deepEqual(semTicket.stages, []);
  assert.ok(semTicket.diagnostics.some((d) => d.code === "TICKET_INVALIDO"));

  const semMeta = calcularAscendente({ ...planoDoCanvas(), goalCents: 0 });
  assert.ok(semMeta.diagnostics.some((d) => d.code === "META_INVALIDA"));
});

test("funil sem etapa nenhuma é erro", () => {
  const r = calcularAscendente({ ...planoDoCanvas(), stages: [] });
  assert.ok(r.diagnostics.some((d) => d.code === "SEM_ETAPAS"));
});

test("taxa 0 e taxa 101 são erro, não infinito nem NaN", () => {
  const zero = calcularAscendente({
    ...planoDoCanvas(),
    stages: [{ id: "s1", label: "Proposta", rate: 0 }],
  });
  const invalida = zero.diagnostics.find((d) => d.code === "TAXA_INVALIDA");
  assert.equal(invalida?.targetId, "s1");
  assert.deepEqual(zero.stages, []);

  const acima = calcularAscendente({
    ...planoDoCanvas(),
    stages: [{ id: "s1", label: "Proposta", rate: 101 }],
  });
  assert.ok(acima.diagnostics.some((d) => d.code === "TAXA_INVALIDA"));
});

test("taxa de 100% em todas as etapas faz topo igual às conversões", () => {
  const r = calcularAscendente({
    ...planoDoCanvas(),
    stages: [
      { id: "s1", label: "A", rate: 100 },
      { id: "s2", label: "B", rate: 100 },
    ],
  });
  assert.equal(r.topVolume, 50);
  assert.equal(r.externalRate, 100);
});

test("volume astronômico vira erro em vez de card ilegível", () => {
  const r = calcularAscendente({
    ...planoDoCanvas(),
    goalCents: 100_000_000_00,
    stages: [{ id: "s1", label: "Proposta", rate: 0.01 }],
  });
  assert.ok(r.diagnostics.some((d) => d.code === "VOLUME_IRREAL"));
  assert.ok(LIMITE_VOLUME > 0);
});

test("valor em formato brasileiro vira centavos", () => {
  assert.equal(parseMoedaParaCentavos("50.000,00"), 5_000_000);
  assert.equal(parseMoedaParaCentavos("R$ 50.000,00"), 5_000_000);
  assert.equal(parseMoedaParaCentavos("1.234,5"), 123_450);
  assert.equal(parseMoedaParaCentavos("1234.56"), 123_456);
  assert.equal(parseMoedaParaCentavos("999"), 99_900);
  assert.equal(parseMoedaParaCentavos("0,07"), 7);
});

test("texto que não é número devolve null, e não NaN disfarçado de zero", () => {
  assert.equal(parseMoedaParaCentavos(""), null);
  assert.equal(parseMoedaParaCentavos("abc"), null);
  assert.equal(parseMoedaParaCentavos("-50"), null);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx tsx --test src/lib/sales-funnel/math.test.ts`
Expected: FAIL — `Cannot find module './math'`.

- [ ] **Step 4: Implementar o motor**

`src/lib/sales-funnel/math.ts`:

```ts
import type {
  Diagnostic,
  FunnelInput,
  FunnelResult,
  StageVolume,
} from "./types";

/**
 * Teto de sanidade do volume. Acima disto não é plano comercial, é erro de
 * digitação numa taxa — e um card com doze dígitos não informa nada.
 */
export const LIMITE_VOLUME = 1_000_000_000;

/** Resultado vazio: o que a tela mostra quando falta dado obrigatório. */
function vazio(diagnostics: Diagnostic[]): FunnelResult {
  return {
    requiredConversions: 0,
    stages: [],
    topVolume: 0,
    externalRate: 0,
    projectedRevenueCents: 0,
    channels: [],
    channelCoverage: 0,
    diagnostics,
  };
}

/**
 * Conversões necessárias para bater a meta — o bloco 1 do canvas.
 *
 * Arredonda para CIMA: meia venda não existe, e registrar 49 onde são
 * precisas 49,2 é registrar um plano que não bate a meta. Ticket maior que a
 * meta continua exigindo UMA conversão, nunca zero.
 */
export function conversoesNecessarias(goalCents: number, ticketCents: number): number {
  if (goalCents <= 0 || ticketCents <= 0) return 0;
  return Math.ceil(goalCents / ticketCents);
}

/**
 * Lê um valor monetário digitado por gente e devolve centavos.
 *
 * Aceita o formato brasileiro ("50.000,00"), o americano ("50000.00"), com ou
 * sem "R$", e o inteiro seco ("999" = R$ 999,00). Devolve null para o que não
 * é valor — a tela precisa distinguir "não preencheu" de "preencheu zero",
 * coisa que NaN convertido em 0 apagaria.
 */
export function parseMoedaParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s ]/g, "");
  if (limpo.length === 0) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) return null;

  // Separador decimal é o ÚLTIMO ponto ou vírgula seguido de 1 ou 2 dígitos.
  const decimal = /[.,]\d{1,2}$/.exec(limpo);
  const inteiroTexto = (decimal ? limpo.slice(0, decimal.index) : limpo).replace(/[.,]/g, "");
  const centavosTexto = decimal ? decimal[0].slice(1).padEnd(2, "0") : "00";

  const inteiro = Number(inteiroTexto === "" ? "0" : inteiroTexto);
  const centavos = Number(centavosTexto);
  if (!Number.isFinite(inteiro) || !Number.isFinite(centavos)) return null;
  return inteiro * 100 + centavos;
}

/** Confere meta, ticket, etapas e taxas. Lista vazia = pode calcular. */
function erros(input: FunnelInput): Diagnostic[] {
  const found: Diagnostic[] = [];
  if (input.goalCents <= 0) {
    found.push({ code: "META_INVALIDA", severity: "erro", message: "Informe a meta global." });
  }
  if (input.ticketCents <= 0) {
    found.push({ code: "TICKET_INVALIDO", severity: "erro", message: "Informe o ticket médio." });
  }
  if (input.stages.length === 0) {
    found.push({
      code: "SEM_ETAPAS",
      severity: "erro",
      message: "Defina ao menos uma etapa do funil.",
    });
  }
  for (const stage of input.stages) {
    if (!(stage.rate > 0 && stage.rate <= 100)) {
      found.push({
        code: "TAXA_INVALIDA",
        severity: "erro",
        targetId: stage.id,
        message: `A taxa de "${stage.label}" precisa ficar entre 0 e 100%.`,
      });
    }
  }
  return found;
}

/**
 * Meta → Prospecções. É a execução que o canvas manda: de baixo para cima,
 * DIVIDINDO por cada taxa até chegar à boca do funil.
 */
export function calcularAscendente(input: FunnelInput): FunnelResult {
  const problemas = erros(input);
  if (problemas.length > 0) return vazio(problemas);

  const conversoes = conversoesNecessarias(input.goalCents, input.ticketCents);

  // Percorre de trás para frente: o volume de uma etapa é o da seguinte
  // dividido pela taxa que as separa.
  const volumes: number[] = new Array(input.stages.length).fill(0);
  let abaixo = conversoes;
  for (let i = input.stages.length - 1; i >= 0; i -= 1) {
    const stage = input.stages[i] as FunnelInput["stages"][number];
    const volume = Math.ceil(abaixo / (stage.rate / 100));
    if (volume > LIMITE_VOLUME) {
      return vazio([
        {
          code: "VOLUME_IRREAL",
          severity: "erro",
          targetId: stage.id,
          message:
            "As taxas informadas exigem um volume impossível. Confira se alguma taxa está muito baixa.",
        },
      ]);
    }
    volumes[i] = volume;
    abaixo = volume;
  }

  const stages: StageVolume[] = input.stages.map((stage, i) => ({
    id: stage.id,
    label: stage.label,
    rate: stage.rate,
    volume: volumes[i] as number,
  }));

  const topVolume = stages[0]?.volume ?? 0;

  return {
    requiredConversions: conversoes,
    stages,
    topVolume,
    externalRate: topVolume > 0 ? (conversoes / topVolume) * 100 : 0,
    projectedRevenueCents: conversoes * input.ticketCents,
    channels: [],
    channelCoverage: 0,
    diagnostics: [],
  };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx tsx --test src/lib/sales-funnel/math.test.ts`
Expected: PASS — todos os testes verdes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sales-funnel/types.ts src/lib/sales-funnel/math.ts src/lib/sales-funnel/math.test.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: o motor sobe da meta até a boca do funil

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Motor — sentido descendente (capacidade → faturamento)

**Files:**
- Modify: `src/lib/sales-funnel/math.ts`
- Modify: `src/lib/sales-funnel/math.test.ts`

**Interfaces:**
- Consumes: `FunnelInput`, `FunnelResult`, `erros` (privada), `LIMITE_VOLUME` da Task 1.
- Produces: `calcularDescendente(input: FunnelInput, topVolume: number): FunnelResult`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `src/lib/sales-funnel/math.test.ts` (o `import` de `calcularDescendente` entra na linha de import já existente):

```ts
test("descendente arredonda para BAIXO: 600 prospecções não viram 30 vendas", () => {
  // 600 -> 50% -> 300 -> 50% -> 150 -> 20% -> 30. Com 599 o corte aparece.
  const r = calcularDescendente(planoDoCanvas(), 599);
  assert.deepEqual(
    r.stages.map((s) => s.volume),
    [599, 299, 149],
  );
  assert.equal(r.requiredConversions, 29);
});

test("descendente projeta o faturamento pelo ticket do plano", () => {
  const r = calcularDescendente(planoDoCanvas(), 1000);
  assert.equal(r.requiredConversions, 50);
  assert.equal(r.projectedRevenueCents, 5_000_000);
});

test("descendente com topo zerado ou negativo é erro", () => {
  const r = calcularDescendente(planoDoCanvas(), 0);
  assert.ok(r.diagnostics.some((d) => d.code === "VOLUME_IRREAL"));
});

test("ida e volta: o topo do ascendente reconstrói as conversões no descendente", () => {
  const plano = planoDoCanvas();
  const subida = calcularAscendente(plano);
  const descida = calcularDescendente(plano, subida.topVolume);
  // O arredondamento é pessimista nos dois sentidos, então a volta nunca
  // promete MENOS do que a meta pedia — pode prometer exatamente.
  assert.ok(descida.requiredConversions >= subida.requiredConversions);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx --test src/lib/sales-funnel/math.test.ts`
Expected: FAIL — `calcularDescendente is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar a `src/lib/sales-funnel/math.ts`:

```ts
/**
 * Capacidade → Faturamento. O outro lado da dica do canvas: de cima para
 * baixo, MULTIPLICANDO. A pessoa fixa quantas prospecções consegue fazer e
 * vê no que isso dá.
 *
 * Arredonda para BAIXO: 600 prospecções que rendem 29,8 vendas rendem 29.
 * Prometer a fração é prometer uma venda que não existe.
 */
export function calcularDescendente(input: FunnelInput, topVolume: number): FunnelResult {
  const problemas = erros(input);
  if (problemas.length > 0) return vazio(problemas);
  if (!(topVolume > 0) || topVolume > LIMITE_VOLUME) {
    return vazio([
      {
        code: "VOLUME_IRREAL",
        severity: "erro",
        message: "Informe quantas prospecções cabem no período.",
      },
    ]);
  }

  const stages: StageVolume[] = [];
  let volume = Math.floor(topVolume);
  for (const stage of input.stages) {
    stages.push({ id: stage.id, label: stage.label, rate: stage.rate, volume });
    volume = Math.floor((volume * stage.rate) / 100);
  }
  // Saindo do laço, `volume` já passou pela taxa da última etapa: são as
  // conversões.
  const conversoes = volume;

  return {
    requiredConversions: conversoes,
    stages,
    topVolume: stages[0]?.volume ?? 0,
    externalRate: topVolume > 0 ? (conversoes / topVolume) * 100 : 0,
    projectedRevenueCents: conversoes * input.ticketCents,
    channels: [],
    channelCoverage: 0,
    diagnostics: [],
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx tsx --test src/lib/sales-funnel/math.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales-funnel/math.ts src/lib/sales-funnel/math.test.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: o sentido descendente, da capacidade ao faturamento

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Motor — canais e cobertura

**Files:**
- Modify: `src/lib/sales-funnel/math.ts`
- Modify: `src/lib/sales-funnel/math.test.ts`

**Interfaces:**
- Consumes: `FunnelResult`, `ChannelInput`, `ChannelVolume` das Tasks 1–2.
- Produces: `distribuirCanais(resultado: FunnelResult, canais: readonly ChannelInput[]): FunnelResult` — devolve um resultado novo com `channels`, `channelCoverage` e os avisos somados aos diagnósticos existentes.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test("a fatia de cada canal vira número absoluto de prospecções", () => {
  const base = calcularAscendente(planoDoCanvas()); // topo 1000
  const r = distribuirCanais(base, [
    { id: "c1", label: "Base de clientes", share: 40 },
    { id: "c2", label: "Indicações", share: 20 },
    { id: "c3", label: "Google", share: 20 },
    { id: "c4", label: "Feiras", share: 10 },
    { id: "c5", label: "Redes sociais", share: 10 },
  ]);
  assert.deepEqual(
    r.channels.map((c) => c.volume),
    [400, 200, 200, 100, 100],
  );
  assert.equal(r.channelCoverage, 100);
  assert.deepEqual(r.diagnostics, []);
});

test("cobertura abaixo e acima de 100% dão avisos distintos, sem travar o cálculo", () => {
  const base = calcularAscendente(planoDoCanvas());
  const falta = distribuirCanais(base, [
    { id: "c1", label: "A", share: 40 },
    { id: "c2", label: "B", share: 20 },
    { id: "c3", label: "C", share: 10 },
    { id: "c4", label: "D", share: 10 },
    { id: "c5", label: "E", share: 5 },
  ]);
  assert.ok(falta.diagnostics.some((d) => d.code === "COBERTURA_INCOMPLETA"));
  assert.equal(falta.topVolume, 1000); // o cálculo continua de pé

  const sobra = distribuirCanais(base, [
    { id: "c1", label: "A", share: 60 },
    { id: "c2", label: "B", share: 30 },
    { id: "c3", label: "C", share: 15 },
    { id: "c4", label: "D", share: 5 },
    { id: "c5", label: "E", share: 5 },
  ]);
  assert.ok(sobra.diagnostics.some((d) => d.code === "COBERTURA_EXCEDIDA"));
});

test("menos de 5 canais avisa, mas não impede nada — o canvas pede no mínimo 5", () => {
  const base = calcularAscendente(planoDoCanvas());
  const r = distribuirCanais(base, [{ id: "c1", label: "Só um", share: 100 }]);
  const aviso = r.diagnostics.find((d) => d.code === "CANAIS_INSUFICIENTES");
  assert.equal(aviso?.severity, "aviso");
  assert.equal(r.channels[0]?.volume, 1000);
});

test("fatia negativa ou acima de 100 é erro do canal, e não entra na cobertura", () => {
  const base = calcularAscendente(planoDoCanvas());
  const r = distribuirCanais(base, [
    { id: "c1", label: "Bom", share: 50 },
    { id: "c2", label: "Ruim", share: -20 },
    { id: "c3", label: "Pior", share: 140 },
  ]);
  const invalidos = r.diagnostics.filter((d) => d.code === "FATIA_INVALIDA");
  assert.deepEqual(
    invalidos.map((d) => d.targetId),
    ["c2", "c3"],
  );
  // A cobertura conta só a fatia válida: um share negativo não "conserta"
  // um estouro por acidente.
  assert.equal(r.channelCoverage, 50);
});

test("funil sem canal nenhum não vira erro nem cobertura fantasma", () => {
  const base = calcularAscendente(planoDoCanvas());
  const r = distribuirCanais(base, []);
  assert.deepEqual(r.channels, []);
  assert.equal(r.channelCoverage, 0);
  assert.ok(r.diagnostics.every((d) => d.severity === "aviso"));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx --test src/lib/sales-funnel/math.test.ts`
Expected: FAIL — `distribuirCanais is not a function`.

- [ ] **Step 3: Implementar**

```ts
/** Quantos canais o canvas manda ter, no mínimo. Abaixo disso é aviso. */
export const MINIMO_CANAIS = 5;

/**
 * Traduz a fatia de cada canal em prospecções e confere a cobertura.
 *
 * Roda DEPOIS do funil porque depende do topo. Fatia inválida não entra na
 * soma: um share negativo abateria um estouro e faria a cobertura parecer
 * correta justamente quando não está.
 */
export function distribuirCanais(
  resultado: FunnelResult,
  canais: readonly ChannelInput[],
): FunnelResult {
  const diagnostics: Diagnostic[] = [...resultado.diagnostics];
  const channels: ChannelVolume[] = [];
  let cobertura = 0;

  for (const canal of canais) {
    const valida = canal.share >= 0 && canal.share <= 100;
    if (!valida) {
      diagnostics.push({
        code: "FATIA_INVALIDA",
        severity: "erro",
        targetId: canal.id,
        message: `A fatia de "${canal.label}" precisa ficar entre 0 e 100%.`,
      });
    } else {
      cobertura += canal.share;
    }
    channels.push({
      id: canal.id,
      label: canal.label,
      share: canal.share,
      volume: valida ? Math.ceil((resultado.topVolume * canal.share) / 100) : 0,
    });
  }

  if (canais.length > 0 && canais.length < MINIMO_CANAIS) {
    diagnostics.push({
      code: "CANAIS_INSUFICIENTES",
      severity: "aviso",
      message: `O canvas recomenda ao menos ${MINIMO_CANAIS} canais de vendas.`,
    });
  }

  // Tolerância de um centésimo: somar 33,33 três vezes não dá 100 exato.
  const arredondada = Math.round(cobertura * 100) / 100;
  if (canais.length > 0 && arredondada < 100) {
    diagnostics.push({
      code: "COBERTURA_INCOMPLETA",
      severity: "aviso",
      message: `Os canais cobrem ${arredondada}% da boca do funil. Faltam ${
        Math.round((100 - arredondada) * 100) / 100
      }%.`,
    });
  }
  if (arredondada > 100) {
    diagnostics.push({
      code: "COBERTURA_EXCEDIDA",
      severity: "aviso",
      message: `Os canais somam ${arredondada}% — ${
        Math.round((arredondada - 100) * 100) / 100
      }% acima da boca do funil.`,
    });
  }

  return { ...resultado, channels, channelCoverage: arredondada, diagnostics };
}
```

Acrescentar `ChannelInput` e `ChannelVolume` ao `import type` no topo do arquivo.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx tsx --test src/lib/sales-funnel/math.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales-funnel/math.ts src/lib/sales-funnel/math.test.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: os canais respondem pela boca do funil

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Motor — cenários

**Files:**
- Create: `src/lib/sales-funnel/scenario.ts`
- Create: `src/lib/sales-funnel/scenario.test.ts`
- Modify: `src/lib/sales-funnel/types.ts`

**Interfaces:**
- Consumes: `FunnelInput`, `FunnelResult`, `calcularAscendente` das Tasks 1–3.
- Produces: `ScenarioInput`, `ScenarioComparison`; `aplicarCenario(plano: FunnelInput, cenario: ScenarioInput): FunnelInput`; `compararCenario(plano: FunnelInput, cenario: ScenarioInput): ScenarioComparison`.

- [ ] **Step 1: Acrescentar os tipos**

Ao fim de `src/lib/sales-funnel/types.ts`:

```ts
/**
 * As três alavancas do bloco 5 do canvas. O cenário guarda só o que MUDA:
 * onde não há entrada em `rates`, a etapa herda a taxa do plano — assim um
 * cenário não congela por acidente uma etapa que o plano corrigiu depois.
 */
export interface ScenarioInput {
  id: string;
  name: string;
  /** "Melhore o ticket médio": +10 = ticket 10% maior. */
  ticketPercent: number;
  /** "Aumente a boca do funil": +25 = 25% mais prospecções. Só no descendente. */
  topPercent: number;
  /** "Melhore as taxas internas": stageId → taxa que substitui a do plano. */
  rates: ReadonlyMap<string, number>;
}

export interface ScenarioComparison {
  plano: FunnelResult;
  cenario: FunnelResult;
  deltaConversions: number;
  deltaRevenueCents: number;
}
```

- [ ] **Step 2: Escrever os testes que falham**

`src/lib/sales-funnel/scenario.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { aplicarCenario, compararCenario } from "./scenario";
import type { FunnelInput, ScenarioInput } from "./types";

function plano(): FunnelInput {
  return {
    goalCents: 5_000_000,
    ticketCents: 100_000,
    stages: [
      { id: "s1", label: "Oportunidades", rate: 50 },
      { id: "s2", label: "Visita", rate: 50 },
      { id: "s3", label: "Proposta", rate: 20 },
    ],
    channels: [],
  };
}

function cenario(over: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    id: "x1",
    name: "Cenário",
    ticketPercent: 0,
    topPercent: 0,
    rates: new Map(),
    ...over,
  };
}

test("etapa sem taxa própria no cenário herda a taxa do plano", () => {
  const aplicado = aplicarCenario(plano(), cenario({ rates: new Map([["s3", 25]]) }));
  assert.deepEqual(
    aplicado.stages.map((s) => s.rate),
    [50, 50, 25],
  );
});

test("ticket 10% maior reduz as conversões necessárias", () => {
  const c = compararCenario(plano(), cenario({ ticketPercent: 10 }));
  assert.equal(c.plano.requiredConversions, 50);
  // R$ 1.100 de ticket: ceil(50000/1100) = 46.
  assert.equal(c.cenario.requiredConversions, 46);
  assert.equal(c.deltaConversions, -4);
});

test("melhorar a taxa de fechamento encolhe a boca do funil", () => {
  const c = compararCenario(plano(), cenario({ rates: new Map([["s3", 25]]) }));
  assert.equal(c.plano.topVolume, 1000);
  assert.equal(c.cenario.topVolume, 800);
});

test("ticketPercent de -100 zera o ticket e vira TICKET_INVALIDO, não divisão por zero", () => {
  const c = compararCenario(plano(), cenario({ ticketPercent: -100 }));
  assert.ok(c.cenario.diagnostics.some((d) => d.code === "TICKET_INVALIDO"));
  assert.equal(c.cenario.requiredConversions, 0);
  assert.ok(Number.isFinite(c.deltaConversions));
});

test("cenário sem alavanca nenhuma é idêntico ao plano", () => {
  const c = compararCenario(plano(), cenario());
  assert.equal(c.deltaConversions, 0);
  assert.equal(c.deltaRevenueCents, 0);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx tsx --test src/lib/sales-funnel/scenario.test.ts`
Expected: FAIL — `Cannot find module './scenario'`.

- [ ] **Step 4: Implementar**

`src/lib/sales-funnel/scenario.ts`:

```ts
import { calcularAscendente } from "./math";
import type { FunnelInput, ScenarioComparison, ScenarioInput } from "./types";

/**
 * Projeta o plano sob as alavancas do cenário.
 *
 * O ticket é arredondado para o centavo inteiro mais próximo: continuamos em
 * centavos inteiros depois do ajuste percentual, que é a única operação do
 * motor capaz de produzir fração de centavo.
 *
 * `topPercent` NÃO entra aqui: ele só faz sentido no sentido descendente, em
 * que o topo é informado, e é aplicado por quem chama `calcularDescendente`.
 */
export function aplicarCenario(plano: FunnelInput, cenario: ScenarioInput): FunnelInput {
  return {
    ...plano,
    ticketCents: Math.round(plano.ticketCents * (1 + cenario.ticketPercent / 100)),
    stages: plano.stages.map((stage) => ({
      ...stage,
      rate: cenario.rates.get(stage.id) ?? stage.rate,
    })),
  };
}

/**
 * Plano e cenário pelo MESMO motor, e a diferença entre eles. Um cenário
 * nunca tem caminho de cálculo próprio — se tivesse, os dois números da tela
 * poderiam divergir por motivo que não é a alavanca.
 */
export function compararCenario(
  plano: FunnelInput,
  cenario: ScenarioInput,
): ScenarioComparison {
  const base = calcularAscendente(plano);
  const projetado = calcularAscendente(aplicarCenario(plano, cenario));
  return {
    plano: base,
    cenario: projetado,
    deltaConversions: projetado.requiredConversions - base.requiredConversions,
    deltaRevenueCents: projetado.projectedRevenueCents - base.projectedRevenueCents,
  };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx tsx --test src/lib/sales-funnel/scenario.test.ts && npm test`
Expected: PASS nos dois — a suíte inteira continua verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sales-funnel/scenario.ts src/lib/sales-funnel/scenario.test.ts src/lib/sales-funnel/types.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: as três alavancas viram cenário comparável

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Schema, migration, permissão e escopo

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/types/index.ts`
- Modify: `src/lib/permissions.ts:7-48`
- Modify: `src/lib/app-scope.ts`
- Create: `prisma/migrations/<timestamp>_sales_funnel/migration.sql` (gerada)

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: modelos `SalesFunnel`, `FunnelStage`, `FunnelChannel`, `FunnelScenario`, `FunnelScenarioRate`; enum `SalesFunnelStatus`; campo `Subsector.funnelEnabled`; permissão `"funnel.manage"`; `AppScope.funnelEnabled`.

- [ ] **Step 1: Acrescentar os modelos ao schema**

Copiar para `prisma/schema.prisma` o bloco `prisma` da §2.2 da spec, **na íntegra**, logo após o modelo `ContentPost`. Acrescentar também, em `model Subsector`, ao lado de `scheduleEnabled`:

```prisma
  // Habilita a ferramenta Funil de Vendas no escopo deste subsetor. Segue a
  // mesma herança de `appsSourceId`: quem herda não configura, recebe.
  funnelEnabled Boolean @default(false)
```

E as relações inversas:

```prisma
  // em model Subsector
  salesFunnels SalesFunnel[]

  // em model User
  salesFunnels     SalesFunnel[]    @relation("SalesFunnelAuthor")
  funnelScenarios  FunnelScenario[] @relation("FunnelScenarioAuthor")
```

- [ ] **Step 2: Gerar a migration e o client**

Run: `npm run db:migrate -- --name sales_funnel`
Expected: migration criada em `prisma/migrations/`, aplicada em `buildconnect_dev`, e o client regenerado sem erro.

- [ ] **Step 3: Acrescentar a permissão**

Em `src/types/index.ts`, dentro da união `Permission`:

```ts
  // Criar, editar, arquivar e excluir um Funil de Vendas, e salvar cenários.
  // Ver o funil não exige permissão: basta acesso ao setor. O que é de gestão
  // é definir a META e as TAXAS — número que a equipe inteira passa a
  // perseguir.
  | "funnel.manage"
```

Em `src/lib/permissions.ts`, acrescentar `"funnel.manage"` às listas de `GESTOR` e de `ADMIN`. **Não** acrescentar a `COLABORADOR`.

- [ ] **Step 4: Levar `funnelEnabled` ao escopo**

Em `src/lib/app-scope.ts`: acrescentar `funnelEnabled: boolean;` à interface `AppScope`, incluir `funnelEnabled: true` nos dois `select` (o do subsetor e o de `appsSource`), e repassar o campo nos dois `return`, exatamente como `scheduleEnabled` já é repassado.

- [ ] **Step 5: Verificar que nada quebrou**

Run: `npm run typecheck && npm test`
Expected: PASS nos dois. O typecheck é o que prova que `AppScope` foi preenchido em todos os pontos de retorno.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/types/index.ts src/lib/permissions.ts src/lib/app-scope.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: os modelos, a permissão e a flag do setor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Script de provisionamento

**Files:**
- Create: `scripts/setup-funil-vendas.ts`
- Modify: `package.json` (script `setup:funil`)
- Modify: `scripts/README.md`

**Interfaces:**
- Consumes: `Subsector.funnelEnabled` da Task 5.
- Produces: `npx tsx scripts/setup-funil-vendas.ts`, idempotente.

- [ ] **Step 1: Escrever o script**

`scripts/setup-funil-vendas.ts` — mesmo formato de `scripts/setup-cronograma.ts`, que já está no repositório e deve ser lido antes:

```ts
/**
 * Build.Connect — habilita a ferramenta Funil de Vendas.
 *
 * Faz uma coisa só, idempotente: liga `funnelEnabled` em Vendas, o subsetor
 * dono da base. Marketing e Criação herdam por `appsSourceId` e NÃO são
 * tocados — quem herda não configura, recebe.
 *
 * Não cria subsetor, não mexe em usuários, conteúdos ou avaliações. É o
 * caminho seguro para uma base já em uso, onde `prisma db seed` não deve ser
 * executado.
 *
 * Uso:
 *   npx tsx scripts/setup-funil-vendas.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const VENDAS_SLUG = "vendas";

async function main() {
  console.log("Build.Connect — setup do Funil de Vendas\n");

  const vendas = await prisma.subsector.findUnique({
    where: { slug: VENDAS_SLUG },
    select: { id: true, label: true },
  });
  if (!vendas) {
    throw new Error(
      'Subsetor "vendas" não encontrado. Rode `npx prisma db seed` antes — ele cria a estrutura base.',
    );
  }

  await prisma.subsector.update({
    where: { id: vendas.id },
    data: { funnelEnabled: true },
  });
  console.log(`  ✓ Funil de Vendas habilitado em ${vendas.label}`);

  const check = await prisma.subsector.findMany({
    where: { OR: [{ id: vendas.id }, { appsSourceId: vendas.id }] },
    select: {
      slug: true,
      funnelEnabled: true,
      appsSource: { select: { slug: true } },
      _count: { select: { salesFunnels: true } },
    },
  });

  console.log("\nEstado atual:");
  for (const row of check) {
    const efetivo = row.appsSource ? "herda" : row.funnelEnabled ? "sim" : "não";
    console.log(
      `  ${row.slug.padEnd(10)} funil=${efetivo}` +
        `  herda=${row.appsSource?.slug ?? "—"}  funis=${row._count.salesFunnels}`,
    );
  }
  console.log("\nAbra /setores/vendas e /setores/marketing — a aba Funil de Vendas deve aparecer.");
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    console.error(
      "\nSe o erro citar coluna inexistente (funnelEnabled), a migration ainda não foi aplicada:" +
        "\n  npx prisma migrate deploy && npx prisma generate",
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Registrar o atalho**

Em `package.json`, ao lado de `"setup:cronograma"`:

```json
    "setup:funil": "tsx scripts/setup-funil-vendas.ts",
```

- [ ] **Step 3: Rodar duas vezes — a segunda prova a idempotência**

Run: `npm run setup:funil && npm run setup:funil`
Expected: as duas execuções terminam com `funil=sim` em `vendas` e `funil=herda` em `marketing` e `criacao`. Nenhum erro na segunda.

- [ ] **Step 4: Documentar**

Acrescentar a `scripts/README.md` uma seção `## setup-funil-vendas.ts — habilitar o Funil de Vendas`, com o comando e a observação de que Marketing e Criação herdam e não precisam de execução própria.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-funil-vendas.ts scripts/README.md package.json
git commit -m "$(cat <<'EOF'
Funil de Vendas: o provisionamento liga a ferramenta em Vendas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Camada de leitura

**Files:**
- Create: `src/types/sales-funnel.ts`
- Create: `src/lib/sales-funnel/data.ts`

**Interfaces:**
- Consumes: `resolveAppScope` (Task 5), `FunnelInput`/`FunnelResult` (Tasks 1–3).
- Produces: `SalesFunnelListItem`, `SalesFunnelDetail`, `SalesFunnelData`; `getSalesFunnelData(slug: string, userId: string, role: Role): Promise<SalesFunnelData | null>`; `getSalesFunnelDetail(slug: string, funnelId: string): Promise<SalesFunnelDetail | null>`; `toFunnelInput(detail: SalesFunnelDetail): FunnelInput`.

- [ ] **Step 1: Escrever os tipos de domínio**

`src/types/sales-funnel.ts`:

```ts
/** Domínio da ferramenta Funil de Vendas, do lado da tela. */

export type SalesFunnelStatus = "RASCUNHO" | "ATIVO" | "ARQUIVADO";

export interface FunnelStageItem {
  id: string;
  order: number;
  label: string;
  rate: number;
  transitionRule?: string;
}

export interface FunnelChannelItem {
  id: string;
  order: number;
  label: string;
  strategy?: string;
  share: number;
}

export interface FunnelScenarioItem {
  id: string;
  name: string;
  notes?: string;
  ticketPercent: number;
  topPercent: number;
  /** stageId → taxa. Só as etapas que o cenário muda. */
  rates: Record<string, number>;
}

/** O card da lista: o suficiente para decidir qual funil abrir. */
export interface SalesFunnelListItem {
  id: string;
  name: string;
  /** ISO da data de referência (o campo DATA do canvas). */
  referenceDate: string;
  goalCents: number;
  ticketCents: number;
  status: SalesFunnelStatus;
  /** Calculado no servidor para o card não depender de JS. */
  requiredConversions: number;
  topVolume: number;
  authorName?: string;
}

export interface SalesFunnelDetail extends SalesFunnelListItem {
  notes?: string;
  stages: readonly FunnelStageItem[];
  channels: readonly FunnelChannelItem[];
  scenarios: readonly FunnelScenarioItem[];
}

export interface SalesFunnelData {
  scopeSlug: string;
  scopeLabel: string;
  /** true quando o subsetor atual lê a base de outro (Marketing lê Vendas). */
  inherited: boolean;
  /** Resolvido no servidor a partir de `funnel.manage`. A UI só reflete. */
  canManage: boolean;
  funnels: readonly SalesFunnelListItem[];
}
```

- [ ] **Step 2: Escrever a leitura**

`src/lib/sales-funnel/data.ts`:

```ts
import { prisma } from "@/lib/db/prisma";
import { resolveAppScope } from "@/lib/app-scope";
import { can } from "@/lib/permissions";
import { calcularAscendente, distribuirCanais } from "./math";
import type { FunnelInput } from "./types";
import type { Role } from "@/types";
import type {
  SalesFunnelData,
  SalesFunnelDetail,
  SalesFunnelListItem,
} from "@/types/sales-funnel";

/**
 * Leitura do Funil de Vendas.
 *
 * Os números dos cards são calculados AQUI, no servidor, pelo mesmo motor que
 * a tela usa. Guardar o resultado no banco criaria uma segunda verdade que
 * envelhece na primeira vez que alguém corrigir uma taxa.
 */

/** Decimal do Prisma → centavos inteiros, que é a moeda do motor. */
function paraCentavos(valor: { toString(): string }): number {
  return Math.round(Number(valor.toString()) * 100);
}

export function toFunnelInput(detail: SalesFunnelDetail): FunnelInput {
  return {
    goalCents: detail.goalCents,
    ticketCents: detail.ticketCents,
    stages: detail.stages.map((s) => ({ id: s.id, label: s.label, rate: s.rate })),
    channels: detail.channels.map((c) => ({ id: c.id, label: c.label, share: c.share })),
  };
}

export async function getSalesFunnelData(
  slug: string,
  role: Role,
): Promise<SalesFunnelData | null> {
  const scope = await resolveAppScope(slug);
  if (!scope || !scope.funnelEnabled) return null;

  const rows = await prisma.salesFunnel.findMany({
    where: { subsectorId: scope.id },
    orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      referenceDate: true,
      goalAmount: true,
      averageTicket: true,
      status: true,
      createdBy: { select: { fullName: true } },
      stages: { orderBy: { order: "asc" }, select: { id: true, label: true, conversionRate: true } },
    },
  });

  const funnels: SalesFunnelListItem[] = rows.map((row) => {
    const goalCents = paraCentavos(row.goalAmount);
    const ticketCents = paraCentavos(row.averageTicket);
    const resultado = calcularAscendente({
      goalCents,
      ticketCents,
      stages: row.stages.map((s) => ({ id: s.id, label: s.label, rate: s.conversionRate })),
      channels: [],
    });
    return {
      id: row.id,
      name: row.name,
      referenceDate: row.referenceDate.toISOString(),
      goalCents,
      ticketCents,
      status: row.status,
      requiredConversions: resultado.requiredConversions,
      topVolume: resultado.topVolume,
      authorName: row.createdBy?.fullName,
    };
  });

  return {
    scopeSlug: scope.slug,
    scopeLabel: scope.label,
    inherited: scope.inherited,
    canManage: can(role, "funnel.manage"),
    funnels,
  };
}

export async function getSalesFunnelDetail(
  slug: string,
  funnelId: string,
): Promise<SalesFunnelDetail | null> {
  const scope = await resolveAppScope(slug);
  if (!scope || !scope.funnelEnabled) return null;

  const row = await prisma.salesFunnel.findFirst({
    // O subsetor no WHERE é o que impede ler o funil de outro setor pelo id.
    where: { id: funnelId, subsectorId: scope.id },
    select: {
      id: true,
      name: true,
      referenceDate: true,
      goalAmount: true,
      averageTicket: true,
      status: true,
      notes: true,
      createdBy: { select: { fullName: true } },
      stages: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          label: true,
          conversionRate: true,
          transitionRule: true,
        },
      },
      channels: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, label: true, strategy: true, share: true },
      },
      scenarios: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          notes: true,
          ticketPercent: true,
          topPercent: true,
          rates: { select: { stageId: true, conversionRate: true } },
        },
      },
    },
  });
  if (!row) return null;

  const goalCents = paraCentavos(row.goalAmount);
  const ticketCents = paraCentavos(row.averageTicket);
  const stages = row.stages.map((s) => ({
    id: s.id,
    order: s.order,
    label: s.label,
    rate: s.conversionRate,
    transitionRule: s.transitionRule ?? undefined,
  }));
  const channels = row.channels.map((c) => ({
    id: c.id,
    order: c.order,
    label: c.label,
    strategy: c.strategy ?? undefined,
    share: c.share,
  }));

  const resultado = distribuirCanais(
    calcularAscendente({
      goalCents,
      ticketCents,
      stages: stages.map((s) => ({ id: s.id, label: s.label, rate: s.rate })),
      channels: [],
    }),
    channels.map((c) => ({ id: c.id, label: c.label, share: c.share })),
  );

  return {
    id: row.id,
    name: row.name,
    referenceDate: row.referenceDate.toISOString(),
    goalCents,
    ticketCents,
    status: row.status,
    notes: row.notes ?? undefined,
    authorName: row.createdBy?.fullName,
    requiredConversions: resultado.requiredConversions,
    topVolume: resultado.topVolume,
    stages,
    channels,
    scenarios: row.scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      notes: s.notes ?? undefined,
      ticketPercent: s.ticketPercent,
      topPercent: s.topPercent,
      rates: Object.fromEntries(s.rates.map((r) => [r.stageId, r.conversionRate])),
    })),
  };
}
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/sales-funnel.ts src/lib/sales-funnel/data.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: a leitura calcula no servidor, sem guardar resultado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Guardas e escritas do funil

**Files:**
- Create: `src/lib/sales-funnel/guards.ts`
- Create: `src/lib/sales-funnel/actions.ts`
- Create: `src/lib/sales-funnel/actions.dbtest.ts`

**Interfaces:**
- Consumes: `resolveAppScope` (Task 5), `getSalesFunnelData` (Task 7), `parseMoedaParaCentavos` (Task 1).
- Produces: `requireFunnelScope(slug, user)`; `requireFunnelManager(user)`; `revalidateFunnelScope(scopeId, currentSlug)`; actions `criarFunil`, `atualizarFunil`, `arquivarFunil`, `excluirFunil`, `salvarEtapas`; tipo `FunnelActionResult { ok: boolean; error?: string; id?: string }`.

- [ ] **Step 1: Escrever as guardas**

`src/lib/sales-funnel/guards.ts` — **sem `"use server"`**, pelo mesmo motivo documentado em `src/lib/cronograma-guards.ts`:

```ts
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { resolveAppScope } from "@/lib/app-scope";
import { can } from "@/lib/permissions";
import type { Role } from "@/types";

/**
 * Guardas das escritas do Funil de Vendas.
 *
 * Módulo SEM "use server" de propósito: exportá-las de `actions.ts` as
 * transformaria em endpoints chamáveis pelo navegador. Aqui são funções de
 * servidor comuns — a mesma decisão de `cronograma-guards.ts`.
 */

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  return { user, error: null };
}

/**
 * Editar meta e taxas é ato de gestão: o número que a equipe inteira passa a
 * perseguir. Ver o funil não passa por aqui.
 */
export function requireFunnelManager(user: { role: string }) {
  if (!can(user.role as Role, "funnel.manage")) {
    return { error: "Só Gestor ou Admin pode alterar o funil." };
  }
  return { error: null };
}

/** Resolve o escopo, confirma a ferramenta ativa e o acesso ao setor. */
export async function requireFunnelScope(slug: string, user: { id: string; role: string }) {
  const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
  if (!canAccessSlug(slugs, slug)) {
    return { scope: null, error: "Você não tem acesso a este setor." };
  }
  const scope = await resolveAppScope(slug);
  if (!scope) return { scope: null, error: "Setor não encontrado." };
  if (!scope.funnelEnabled) {
    return { scope: null, error: "O Funil de Vendas não está habilitado neste setor." };
  }
  return { scope, error: null };
}

/**
 * Revalida os OUTROS setores que compartilham a base. O atual fica de fora:
 * revalidar a própria rota remonta a página e devolve o usuário à primeira
 * aba — quem atualiza a tela é o `router.refresh()` do componente.
 */
export async function revalidateFunnelScope(scopeId: string, currentSlug: string) {
  const sharing = await prisma.subsector.findMany({
    where: { OR: [{ id: scopeId }, { appsSourceId: scopeId }] },
    select: { slug: true },
  });
  for (const row of sharing as Array<{ slug: string }>) {
    if (row.slug !== currentSlug) revalidatePath(`/setores/${row.slug}`);
  }
}
```

- [ ] **Step 2: Escrever as actions**

`src/lib/sales-funnel/actions.ts` — com `"use server"`:

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  requireFunnelManager,
  requireFunnelScope,
  requireUser,
  revalidateFunnelScope,
} from "./guards";

export interface FunnelActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

/**
 * Escritas do Funil de Vendas.
 *
 * Toda action repete a sequência: sessão → permissão → escopo. O escopo vem
 * do SLUG, nunca do cliente: Marketing e Vendas escrevem na mesma base, e
 * quem decide qual é ela é `resolveAppScope` no servidor.
 */

/** Valor monetário chega da tela já em centavos inteiros. */
const centavos = z
  .number()
  .int("Valor inválido.")
  .positive("Informe um valor maior que zero.")
  .max(999_999_999_99, "Valor acima do limite.");

const funilSchema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(1, "Dê um nome ao funil.").max(80, "Nome muito longo."),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  goalCents: centavos,
  ticketCents: centavos,
  notes: z.string().trim().max(1000, "Observação muito longa.").optional(),
});

const etapaSchema = z.object({
  label: z.string().trim().min(1, "Toda etapa precisa de nome.").max(40, "Nome muito longo."),
  rate: z.number().gt(0, "A taxa precisa ser maior que zero.").max(100, "A taxa não passa de 100%."),
  transitionRule: z.string().trim().max(500, "Regra muito longa.").optional(),
});

const etapasSchema = z.object({
  slug: z.string().min(1),
  funnelId: z.string().min(1),
  stages: z
    .array(etapaSchema)
    .min(3, "O funil precisa de ao menos 3 etapas.")
    .max(6, "O funil aceita no máximo 6 etapas."),
});

export async function criarFunil(input: unknown): Promise<FunnelActionResult> {
  const parsed = funilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { user, error: userError } = await requireUser();
  if (!user) return { ok: false, error: userError ?? undefined };

  const permissao = requireFunnelManager(user);
  if (permissao.error) return { ok: false, error: permissao.error };

  const { scope, error: scopeError } = await requireFunnelScope(parsed.data.slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const criado = await prisma.salesFunnel.create({
    data: {
      name: parsed.data.name,
      referenceDate: new Date(`${parsed.data.referenceDate}T12:00:00`),
      goalAmount: (parsed.data.goalCents / 100).toFixed(2),
      averageTicket: (parsed.data.ticketCents / 100).toFixed(2),
      notes: parsed.data.notes || null,
      subsectorId: scope.id,
      createdById: user.id,
      // O funil nasce com o modelo sugerido pelo canvas. Três etapas é o
      // mínimo, e vir preenchido é o que faz a ferramenta abrir já mostrando
      // um número em vez de um formulário vazio.
      stages: {
        create: [
          { order: 0, label: "Oportunidades", conversionRate: 50 },
          { order: 1, label: "Visita", conversionRate: 50 },
          { order: 2, label: "Proposta", conversionRate: 20 },
        ],
      },
    },
    select: { id: true },
  });

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: criado.id };
}

export async function atualizarFunil(
  funnelId: string,
  input: unknown,
): Promise<FunnelActionResult> {
  const parsed = funilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { user, error: userError } = await requireUser();
  if (!user) return { ok: false, error: userError ?? undefined };

  const permissao = requireFunnelManager(user);
  if (permissao.error) return { ok: false, error: permissao.error };

  const { scope, error: scopeError } = await requireFunnelScope(parsed.data.slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  // O subsetor no WHERE é o que impede editar o funil de outro setor por id.
  const alterados = await prisma.salesFunnel.updateMany({
    where: { id: funnelId, subsectorId: scope.id },
    data: {
      name: parsed.data.name,
      referenceDate: new Date(`${parsed.data.referenceDate}T12:00:00`),
      goalAmount: (parsed.data.goalCents / 100).toFixed(2),
      averageTicket: (parsed.data.ticketCents / 100).toFixed(2),
      notes: parsed.data.notes || null,
    },
  });
  if (alterados.count === 0) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: funnelId };
}

export async function arquivarFunil(
  slug: string,
  funnelId: string,
  status: "RASCUNHO" | "ATIVO" | "ARQUIVADO",
): Promise<FunnelActionResult> {
  const { user, error: userError } = await requireUser();
  if (!user) return { ok: false, error: userError ?? undefined };

  const permissao = requireFunnelManager(user);
  if (permissao.error) return { ok: false, error: permissao.error };

  const { scope, error: scopeError } = await requireFunnelScope(slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const alterados = await prisma.salesFunnel.updateMany({
    where: { id: funnelId, subsectorId: scope.id },
    data: { status },
  });
  if (alterados.count === 0) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, slug);
  return { ok: true, id: funnelId };
}

export async function excluirFunil(slug: string, funnelId: string): Promise<FunnelActionResult> {
  const { user, error: userError } = await requireUser();
  if (!user) return { ok: false, error: userError ?? undefined };

  const permissao = requireFunnelManager(user);
  if (permissao.error) return { ok: false, error: permissao.error };

  const { scope, error: scopeError } = await requireFunnelScope(slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const apagados = await prisma.salesFunnel.deleteMany({
    where: { id: funnelId, subsectorId: scope.id },
  });
  if (apagados.count === 0) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, slug);
  return { ok: true };
}

/**
 * Substitui a lista de etapas inteira, em transação.
 *
 * Apagar e recriar num `$transaction` é o que garante que `@@unique([funnelId,
 * order])` nunca veja um estado intermediário com ordem duplicada — e que um
 * erro no meio não deixe o funil com metade das etapas.
 *
 * Os ids das etapas MUDAM a cada salvamento. Por isso as taxas de cenário que
 * apontavam para elas são apagadas junto (cascata do banco): um cenário não
 * pode apontar para uma etapa que deixou de existir.
 */
export async function salvarEtapas(input: unknown): Promise<FunnelActionResult> {
  const parsed = etapasSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { user, error: userError } = await requireUser();
  if (!user) return { ok: false, error: userError ?? undefined };

  const permissao = requireFunnelManager(user);
  if (permissao.error) return { ok: false, error: permissao.error };

  const { scope, error: scopeError } = await requireFunnelScope(parsed.data.slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const funil = await prisma.salesFunnel.findFirst({
    where: { id: parsed.data.funnelId, subsectorId: scope.id },
    select: { id: true },
  });
  if (!funil) return { ok: false, error: "Funil não encontrado." };

  await prisma.$transaction([
    prisma.funnelStage.deleteMany({ where: { funnelId: funil.id } }),
    prisma.funnelStage.createMany({
      data: parsed.data.stages.map((stage, order) => ({
        funnelId: funil.id,
        order,
        label: stage.label,
        conversionRate: stage.rate,
        transitionRule: stage.transitionRule || null,
      })),
    }),
  ]);

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: funil.id };
}
```

- [ ] **Step 3: Escrever o teste de banco que falha**

`src/lib/sales-funnel/actions.dbtest.ts` — montar setor, subsetor com `funnelEnabled: true`, um segundo subsetor herdeiro, e três usuários (COLABORADOR, GESTOR, ADMIN), no formato de `src/lib/video-rating.dbtest.ts`, que deve ser lido antes. Os casos:

```ts
test("Colaborador não cria funil", async () => {
  const r = await comoUsuario(colaboradorId, () =>
    criarFunil({
      slug: vendasSlug,
      name: "Tentativa",
      referenceDate: "2026-10-01",
      goalCents: 5_000_000,
      ticketCents: 100_000,
    }),
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /Gestor ou Admin/);
  assert.equal(await prisma.salesFunnel.count({ where: { subsectorId: vendasId } }), 0);
});

test("Gestor cria, e o funil nasce com as três etapas do modelo", async () => {
  const r = await comoUsuario(gestorId, () =>
    criarFunil({
      slug: vendasSlug,
      name: "Varejo · Out/2026",
      referenceDate: "2026-10-01",
      goalCents: 5_000_000,
      ticketCents: 100_000,
    }),
  );
  assert.equal(r.ok, true);
  const etapas = await prisma.funnelStage.findMany({
    where: { funnelId: r.id },
    orderBy: { order: "asc" },
    select: { label: true, conversionRate: true },
  });
  assert.deepEqual(
    etapas.map((e) => e.label),
    ["Oportunidades", "Visita", "Proposta"],
  );
});

test("funil criado em Vendas aparece na leitura de Marketing (base compartilhada)", async () => {
  const dados = await getSalesFunnelData(marketingSlug, "GESTOR");
  assert.equal(dados?.inherited, true);
  assert.equal(dados?.scopeSlug, vendasSlug);
  assert.ok((dados?.funnels.length ?? 0) > 0);
});

test("setor sem funnelEnabled recusa a escrita", async () => {
  const r = await comoUsuario(gestorId, () =>
    criarFunil({
      slug: setorSemFunilSlug,
      name: "X",
      referenceDate: "2026-10-01",
      goalCents: 100,
      ticketCents: 100,
    }),
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /não está habilitado/);
});

test("salvar etapas substitui a lista inteira, sem ordem duplicada nem buraco", async () => {
  const funil = await prisma.salesFunnel.findFirstOrThrow({ where: { subsectorId: vendasId } });
  const r = await comoUsuario(gestorId, () =>
    salvarEtapas({
      slug: vendasSlug,
      funnelId: funil.id,
      stages: [
        { label: "Lead", rate: 30 },
        { label: "Reunião", rate: 60 },
        { label: "Proposta", rate: 25 },
        { label: "Negociação", rate: 40 },
      ],
    }),
  );
  assert.equal(r.ok, true);
  const etapas = await prisma.funnelStage.findMany({
    where: { funnelId: funil.id },
    orderBy: { order: "asc" },
    select: { order: true, label: true },
  });
  assert.deepEqual(
    etapas.map((e) => e.order),
    [0, 1, 2, 3],
  );
  assert.equal(etapas[0]?.label, "Lead");
});

test("menos de 3 etapas é recusado", async () => {
  const funil = await prisma.salesFunnel.findFirstOrThrow({ where: { subsectorId: vendasId } });
  const r = await comoUsuario(gestorId, () =>
    salvarEtapas({
      slug: vendasSlug,
      funnelId: funil.id,
      stages: [{ label: "Só uma", rate: 50 }],
    }),
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /ao menos 3 etapas/);
});
```

`comoUsuario(userId, fn)` é o utilitário do próprio arquivo que troca a sessão corrente — implementar com `mock.method` de `node:test` sobre `getCurrentUser`, importado de `@/lib/auth/require-user`, devolvendo `{ id, role }` do usuário pedido.

- [ ] **Step 4: Rodar e confirmar que falha, depois que passa**

Run: `npm run test:db`
Expected: primeiro FAIL (módulos ainda não existiam quando o teste foi escrito), depois PASS após os Steps 1–2.

- [ ] **Step 5: Limpar o rastro do teste**

O `after()` do arquivo apaga setor, subsetores e usuários criados pelo `before()`. Confirmar com:

Run: `node -e "require('dotenv').config();const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.salesFunnel.count().then(n=>console.log('funis restantes:',n)).finally(()=>p.$disconnect())"`
Expected: o número não cresce a cada execução da suíte.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sales-funnel/guards.ts src/lib/sales-funnel/actions.ts src/lib/sales-funnel/actions.dbtest.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: as escritas passam por sessão, permissão e escopo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: A aba e a lista de funis

**Files:**
- Create: `src/components/sales-funnel/sales-funnel-panel.tsx`
- Create: `src/components/sales-funnel/funnel-card.tsx`
- Create: `src/components/sales-funnel/new-funnel-modal.tsx`
- Create: `src/lib/sales-funnel/format.ts`
- Modify: `src/components/sector/sector-page.tsx`
- Modify: `src/app/setores/[slug]/page.tsx`
- Modify: `src/types/sector.ts` (acrescentar `"funil-vendas"` a `TabId`)

**Interfaces:**
- Consumes: `getSalesFunnelData` (Task 7), `criarFunil`/`arquivarFunil` (Task 8), `SalesFunnelData` (Task 7).
- Produces: `formatarReais(cents: number): string`; `<SalesFunnelPanel data={...} slug={...} />`.

- [ ] **Step 1: Escrever o formatador e seu teste**

`src/lib/sales-funnel/format.ts`:

```ts
/** Centavos inteiros → "R$ 50.000,00". A UI nunca formata moeda à mão. */
export function formatarReais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Número de volume com separador de milhar: 1000 → "1.000". */
export function formatarVolume(valor: number): string {
  return valor.toLocaleString("pt-BR");
}
```

`src/lib/sales-funnel/format.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { formatarReais, formatarVolume } from "./format";

test("centavos viram reais no formato brasileiro", () => {
  assert.equal(formatarReais(5_000_000).replace(/ /g, " "), "R$ 50.000,00");
  assert.equal(formatarReais(7).replace(/ /g, " "), "R$ 0,07");
});

test("volume ganha separador de milhar", () => {
  assert.equal(formatarVolume(1000), "1.000");
  assert.equal(formatarVolume(50), "50");
});
```

Run: `npx tsx --test src/lib/sales-funnel/format.test.ts` — FAIL, depois PASS.

- [ ] **Step 2: Acrescentar a aba**

Em `src/types/sector.ts`, acrescentar `"funil-vendas"` à união `TabId`.

Em `src/components/sector/sector-page.tsx`:

```tsx
/** Aba da ferramenta Funil de Vendas — só entra quando o subsetor a habilita. */
const FUNIL_TAB: TabDef = { id: "funil-vendas", label: "Funil de Vendas" };
```

Acrescentar `salesFunnel?: SalesFunnelData | null` às props de `SectorPage`, incluir `FUNIL_TAB` logo após `CRONOGRAMA_TAB` na montagem de `tabs` quando `salesFunnel` não é nulo (mesmo padrão condicional já usado para `cronograma`), e renderizar o `<TabPanel>` correspondente com `<SalesFunnelPanel data={salesFunnel} slug={sector.slug} />`.

Em `src/app/setores/[slug]/page.tsx`, ao lado da chamada de `getCronogramaData`:

```tsx
  // Funil de Vendas: null quando o subsetor (ou sua origem) não habilita a
  // ferramenta — mesma regra do Cronograma.
  const salesFunnel = await getSalesFunnelData(slug, role);
```

e passar `salesFunnel={salesFunnel}` ao `<SectorPage>`.

- [ ] **Step 3: Escrever o card**

`src/components/sales-funnel/funnel-card.tsx` — card clicável com nome, data de referência formatada, `Badge` de status (`RASCUNHO` neutro, `ATIVO` primary, `ARQUIVADO` neutro apagado, usando `@/components/ui/badge`), e a linha de resultado:

```tsx
<p className="text-sm text-muted">
  {formatarReais(funnel.goalCents)} · {formatarVolume(funnel.requiredConversions)} conversões ·{" "}
  {formatarVolume(funnel.topVolume)} prospecções
</p>
```

Quando `requiredConversions` é 0, mostrar `Faltam dados para calcular` em vez da linha — é o funil cuja meta ou ticket ainda não foi preenchido.

- [ ] **Step 4: Escrever o painel e o modal de criação**

`sales-funnel-panel.tsx` (`"use client"`): grade de `FunnelCard`, `EmptyState` quando não há funis, botão **Novo funil** só quando `data.canManage`, e um `Segmented` para filtrar status (Todos / Rascunho / Ativo / Arquivado) com **Arquivado escondido por padrão**. Selecionar um card guarda o `id` em estado e troca para o editor (Task 10); enquanto o editor não existe, mostrar o nome do funil selecionado e um botão "Voltar".

`new-funnel-modal.tsx`: `Modal` com nome, data, meta e ticket. Os dois campos monetários usam `parseMoedaParaCentavos` no `onBlur` — valor que não converte mostra o erro `Valor inválido.` no próprio campo e desabilita o envio. Ao confirmar, chama `criarFunil` e, no `ok`, `router.refresh()`.

- [ ] **Step 5: Verificar na tela**

Run: `npm run dev`, abrir `http://localhost:3000/setores/vendas`, entrar como `admin#BC`.
Expected: a aba **Funil de Vendas** aparece depois de Cronograma; criar um funil com meta R$ 50.000 e ticket R$ 1.000 produz um card lendo `R$ 50.000,00 · 50 conversões · 1.000 prospecções`. Abrir `/setores/marketing` mostra o mesmo card.

- [ ] **Step 6: Commit**

```bash
git add src/components/sales-funnel src/lib/sales-funnel/format.ts src/lib/sales-funnel/format.test.ts src/components/sector/sector-page.tsx "src/app/setores/[slug]/page.tsx" src/types/sector.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: a aba entra ao lado do Cronograma, com a lista de funis

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: O editor — meta, etapas, taxas e o funil desenhado

**Files:**
- Create: `src/components/sales-funnel/funnel-editor.tsx`
- Create: `src/components/sales-funnel/funnel-shape.tsx`
- Create: `src/components/sales-funnel/stage-row.tsx`
- Create: `src/components/sales-funnel/diagnostics-list.tsx`
- Modify: `src/components/sales-funnel/sales-funnel-panel.tsx`
- Modify: `src/app/setores/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getSalesFunnelDetail`/`toFunnelInput` (Task 7), `atualizarFunil`/`salvarEtapas` (Task 8), `calcularAscendente`/`calcularDescendente`/`distribuirCanais` (Tasks 1–3), `formatarReais`/`formatarVolume` (Task 9).
- Produces: `<FunnelEditor detail={...} slug={...} canManage={...} />`; `<FunnelShape stages={...} />`.

- [ ] **Step 1: Escrever o desenho do funil**

`src/components/sales-funnel/funnel-shape.tsx` — SVG inline, cores fixas em hex para valer nos dois temas (mesma decisão de `funnel-donut.tsx`):

```tsx
import type { StageVolume } from "@/lib/sales-funnel/types";
import { formatarVolume } from "@/lib/sales-funnel/format";

/** Tons do funil, do topo (frio) ao fundo (quente). Fixos em hex: o projeto
 *  marca o tema claro com a classe `light` no <html>, e cor via CSS variável
 *  não sobreviveria à captura de tela nem ao tema invertido. */
const TONS = ["#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#ef4444"];

/**
 * O funil como trapézio empilhado: a LARGURA de cada faixa é proporcional ao
 * volume da etapa, então o estrangulamento se enxerga sem ler número.
 *
 * A escala é relativa ao topo, e não ao maior valor: o topo é sempre o maior
 * num funil válido, e ancorar nele mantém as faixas comparáveis entre dois
 * funis lado a lado.
 */
export function FunnelShape({ stages }: { stages: readonly StageVolume[] }) {
  if (stages.length === 0) return null;
  const topo = stages[0]?.volume ?? 0;
  if (topo <= 0) return null;

  const alturaFaixa = 56;
  const altura = stages.length * alturaFaixa;
  const largura = 320;
  const minimo = 0.12; // nenhuma faixa some: 12% da largura é o piso

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="w-full max-w-[320px]"
      role="img"
      aria-label={`Funil com ${stages.length} etapas, de ${formatarVolume(topo)} no topo`}
    >
      {stages.map((stage, i) => {
        const fracao = Math.max(stage.volume / topo, minimo);
        const seguinte = stages[i + 1];
        const fracaoBaixo = seguinte
          ? Math.max(seguinte.volume / topo, minimo)
          : fracao * 0.7;
        const y = i * alturaFaixa;
        const x1 = (largura * (1 - fracao)) / 2;
        const x2 = largura - x1;
        const x3 = largura - (largura * (1 - fracaoBaixo)) / 2;
        const x4 = (largura * (1 - fracaoBaixo)) / 2;
        return (
          <g key={stage.id}>
            <polygon
              points={`${x1},${y} ${x2},${y} ${x3},${y + alturaFaixa} ${x4},${y + alturaFaixa}`}
              fill={TONS[i % TONS.length]}
              fillOpacity={0.85}
            />
            <text
              x={largura / 2}
              y={y + alturaFaixa / 2 + 5}
              textAnchor="middle"
              className="fill-white text-[13px] font-semibold"
            >
              {formatarVolume(stage.volume)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Escrever a lista de diagnósticos**

`diagnostics-list.tsx` — recebe `readonly Diagnostic[]`, separa por `severity`, e renderiza erro com fundo vermelho translúcido e aviso com âmbar. Cada linha mostra `diagnostic.message` — o componente **não** monta frase, o motor já entregou pronta. Lista vazia devolve `null`.

- [ ] **Step 3: Escrever a linha de etapa**

`stage-row.tsx` — nome (input texto), taxa (input numérico com sufixo `%`), regra de transição (textarea recolhível), o volume calculado à direita, e os botões de subir/descer/remover. Desabilitado inteiro quando `!canManage`. Remover fica desabilitado quando restam 3 etapas; acrescentar, quando há 6.

- [ ] **Step 4: Escrever o editor**

`funnel-editor.tsx` (`"use client"`): estado local com meta, ticket e etapas; `useMemo` roda `calcularAscendente` (ou `calcularDescendente` quando o modo é capacidade) a cada tecla, então o número muda enquanto a pessoa digita **sem ida ao servidor**. Um botão **Salvar** persiste via `atualizarFunil` + `salvarEtapas` e faz `router.refresh()`.

O bloco 1 mostra, em destaque:

```tsx
<p className="text-3xl font-bold">
  Precisaria de {formatarVolume(resultado.requiredConversions)} conversões
</p>
```

Um `Segmented` alterna **Meta → Prospecções** e **Capacidade → Faturamento**; no segundo modo, um campo pede o topo e o destaque passa a ser o faturamento projetado (`formatarReais(resultado.projectedRevenueCents)`).

Abaixo de tudo, um `Collapse` com o glossário do canvas — Cliente, Prospect e Lead — com os textos do rodapé da folha. É definição estável: vive no componente, não no banco.

- [ ] **Step 5: Ligar ao painel e à página**

Em `sales-funnel-panel.tsx`, selecionar um card passa a renderizar `<FunnelEditor>`. O detalhe é carregado no servidor: acrescentar `searchParams.funil` à página do setor e, quando presente, chamar `getSalesFunnelDetail(slug, funil)` e passar adiante — o mesmo mecanismo de `?aba=` que a página já usa para restaurar estado.

- [ ] **Step 6: Verificar na tela**

Run: `npm run dev` e abrir o funil criado na Task 9.
Expected: digitar `1.200` no ticket faz as conversões caírem de 50 para 42 na hora; baixar a taxa da última etapa para 10% dobra o topo para 2.000; o desenho do funil afina; zerar o ticket troca o número por um erro em vermelho dizendo `Informe o ticket médio.`; salvar e recarregar mantém tudo.

- [ ] **Step 7: Commit**

```bash
git add src/components/sales-funnel "src/app/setores/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
Funil de Vendas: o editor calcula enquanto se digita, e o funil se desenha

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Canais e cobertura

**Files:**
- Create: `src/components/sales-funnel/channels-section.tsx`
- Modify: `src/lib/sales-funnel/actions.ts`
- Modify: `src/lib/sales-funnel/actions.dbtest.ts`
- Modify: `src/components/sales-funnel/funnel-editor.tsx`

**Interfaces:**
- Consumes: `distribuirCanais`/`MINIMO_CANAIS` (Task 3), `requireFunnelScope`/`requireFunnelManager` (Task 8).
- Produces: `salvarCanais(input: unknown): Promise<FunnelActionResult>`; `<ChannelsSection channels={...} topVolume={...} />`.

- [ ] **Step 1: Escrever a action e seu teste de banco**

`salvarCanais` repete a estrutura de `salvarEtapas` — sessão, permissão, escopo, funil no escopo, `$transaction` com `deleteMany` + `createMany`. Schema:

```ts
const canalSchema = z.object({
  label: z.string().trim().min(1, "Todo canal precisa de nome.").max(40, "Nome muito longo."),
  strategy: z.string().trim().max(300, "Estratégia muito longa.").optional(),
  share: z.number().min(0, "A fatia não pode ser negativa.").max(100, "A fatia não passa de 100%."),
});

const canaisSchema = z.object({
  slug: z.string().min(1),
  funnelId: z.string().min(1),
  // Sem mínimo: o canvas RECOMENDA 5, e recomendação vira aviso no motor, não
  // trava na escrita. Quem está montando o funil salva com dois e volta depois.
  channels: z.array(canalSchema).max(12, "Máximo de 12 canais."),
});
```

Teste a acrescentar em `actions.dbtest.ts`:

```ts
test("salvar canais substitui a lista e aceita menos de 5 sem reclamar", async () => {
  const funil = await prisma.salesFunnel.findFirstOrThrow({ where: { subsectorId: vendasId } });
  const r = await comoUsuario(gestorId, () =>
    salvarCanais({
      slug: vendasSlug,
      funnelId: funil.id,
      channels: [
        { label: "Base de clientes", share: 40, strategy: "Ligação mensal" },
        { label: "Indicações", share: 60 },
      ],
    }),
  );
  assert.equal(r.ok, true);
  const canais = await prisma.funnelChannel.findMany({
    where: { funnelId: funil.id },
    orderBy: { order: "asc" },
  });
  assert.equal(canais.length, 2);
  assert.equal(canais[0]?.order, 0);
});

test("fatia negativa é recusada na escrita, não só avisada no cálculo", async () => {
  const funil = await prisma.salesFunnel.findFirstOrThrow({ where: { subsectorId: vendasId } });
  const r = await comoUsuario(gestorId, () =>
    salvarCanais({
      slug: vendasSlug,
      funnelId: funil.id,
      channels: [{ label: "Ruim", share: -10 }],
    }),
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /não pode ser negativa/);
});
```

Run: `npm run test:db` — FAIL, depois PASS.

- [ ] **Step 2: Escrever a seção de canais**

`channels-section.tsx`: lista de linhas (nome, estratégia/frequência, fatia em `%`, volume absoluto calculado), botão de acrescentar/remover, e a **barra de cobertura** — uma barra horizontal com os segmentos de cada canal proporcionais à fatia, mais o texto vindo do diagnóstico (`COBERTURA_INCOMPLETA` / `COBERTURA_EXCEDIDA` / `CANAIS_INSUFICIENTES`). Cobertura exata em 100% mostra a barra cheia sem texto de aviso.

- [ ] **Step 3: Ligar ao editor**

Acrescentar a seção ao `funnel-editor.tsx`, depois das etapas. O `useMemo` do editor passa a encadear `distribuirCanais(calcularAscendente(input), canais)` para que os volumes de canal também mudem enquanto se digita.

- [ ] **Step 4: Verificar na tela**

Expected: com topo 1.000 e canais 40/20/20/10/10, as linhas mostram 400/200/200/100/100 e a barra fecha 100% sem aviso; trocar o último para 5% faz aparecer `Os canais cobrem 95% da boca do funil. Faltam 5%.`; apagar até sobrar dois faz aparecer o aviso de mínimo 5, sem travar nada.

- [ ] **Step 5: Commit**

```bash
git add src/components/sales-funnel/channels-section.tsx src/components/sales-funnel/funnel-editor.tsx src/lib/sales-funnel/actions.ts src/lib/sales-funnel/actions.dbtest.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: os canais mostram quanto cada um precisa entregar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Cenários

**Files:**
- Create: `src/components/sales-funnel/scenarios-section.tsx`
- Create: `src/components/sales-funnel/scenario-modal.tsx`
- Modify: `src/lib/sales-funnel/actions.ts`
- Modify: `src/lib/sales-funnel/actions.dbtest.ts`
- Modify: `src/components/sales-funnel/funnel-editor.tsx`

**Interfaces:**
- Consumes: `compararCenario`/`ScenarioInput` (Task 4), guardas (Task 8), `FunnelScenarioItem` (Task 7).
- Produces: `salvarCenario(input: unknown): Promise<FunnelActionResult>`; `excluirCenario(slug, scenarioId)`; `<ScenariosSection ... />`.

- [ ] **Step 1: Escrever as actions e o teste de banco**

`salvarCenario` grava `FunnelScenario` e, em `$transaction`, substitui as linhas de `FunnelScenarioRate`. Schema:

```ts
const cenarioSchema = z.object({
  slug: z.string().min(1),
  funnelId: z.string().min(1),
  /** Ausente = criar; presente = substituir o cenário existente. */
  scenarioId: z.string().optional(),
  name: z.string().trim().min(1, "Dê um nome ao cenário.").max(60, "Nome muito longo."),
  notes: z.string().trim().max(500, "Observação muito longa.").optional(),
  // -100 zera o ticket de propósito: o motor devolve TICKET_INVALIDO e a tela
  // mostra o erro. Barrar aqui esconderia a alavanca em vez de explicá-la.
  ticketPercent: z.number().min(-100).max(500),
  topPercent: z.number().min(-100).max(500),
  rates: z.array(z.object({ stageId: z.string().min(1), rate: z.number().gt(0).max(100) })),
});
```

Teste:

```ts
test("cenário guarda só as taxas que muda", async () => {
  const funil = await prisma.salesFunnel.findFirstOrThrow({
    where: { subsectorId: vendasId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  const ultima = funil.stages[funil.stages.length - 1];
  const r = await comoUsuario(gestorId, () =>
    salvarCenario({
      slug: vendasSlug,
      funnelId: funil.id,
      name: "+10% no ticket",
      ticketPercent: 10,
      topPercent: 0,
      rates: [{ stageId: ultima!.id, rate: 25 }],
    }),
  );
  assert.equal(r.ok, true);
  const taxas = await prisma.funnelScenarioRate.findMany({ where: { scenarioId: r.id } });
  assert.equal(taxas.length, 1);
  assert.equal(taxas[0]?.stageId, ultima!.id);
});

test("Colaborador não salva cenário", async () => {
  const funil = await prisma.salesFunnel.findFirstOrThrow({ where: { subsectorId: vendasId } });
  const r = await comoUsuario(colaboradorId, () =>
    salvarCenario({
      slug: vendasSlug,
      funnelId: funil.id,
      name: "Tentativa",
      ticketPercent: 0,
      topPercent: 0,
      rates: [],
    }),
  );
  assert.equal(r.ok, false);
});

test("trocar as etapas apaga as taxas de cenário que apontavam para elas", async () => {
  const funil = await prisma.salesFunnel.findFirstOrThrow({ where: { subsectorId: vendasId } });
  await comoUsuario(gestorId, () =>
    salvarEtapas({
      slug: vendasSlug,
      funnelId: funil.id,
      stages: [
        { label: "A", rate: 50 },
        { label: "B", rate: 50 },
        { label: "C", rate: 20 },
      ],
    }),
  );
  const orfas = await prisma.funnelScenarioRate.count({
    where: { scenario: { funnelId: funil.id } },
  });
  assert.equal(orfas, 0);
});
```

Run: `npm run test:db` — FAIL, depois PASS.

- [ ] **Step 2: Escrever a seção de cenários**

`scenarios-section.tsx`: o **plano** como primeira coluna e cada cenário ao lado, mostrando conversões necessárias, topo e faturamento, mais a diferença em relação ao plano com sinal e cor (`-4 conversões` em verde quando o cenário exige menos; `+R$ 5.000,00` em verde quando fatura mais). A comparação usa `compararCenario` no cliente.

Quando `canManage` é falso: os controles do modal continuam operáveis (o Colaborador simula), o botão **Salvar cenário** não aparece, e um texto explica que a simulação não será guardada.

- [ ] **Step 3: Escrever o modal**

`scenario-modal.tsx`: nome, observação, e as três alavancas — ticket (`%`), boca do funil (`%`, só habilitada no modo capacidade) e uma linha por etapa com a taxa do cenário, cujo placeholder é a taxa do plano para deixar claro o que se herda ao não preencher.

- [ ] **Step 4: Verificar na tela**

Expected: criar `+10% no ticket` mostra 46 conversões contra 50 do plano, com `-4` em verde; criar um cenário com ticket `-100%` mostra o erro `Informe o ticket médio.` na coluna do cenário, sem quebrar a do plano; excluir um cenário o remove da comparação.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test && npm run test:db && npm run typecheck && npm run lint`
Expected: PASS nos quatro.

- [ ] **Step 6: Commit**

```bash
git add src/components/sales-funnel src/lib/sales-funnel/actions.ts src/lib/sales-funnel/actions.dbtest.ts
git commit -m "$(cat <<'EOF'
Funil de Vendas: os cenários ficam lado a lado com o plano

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Notas de autorrevisão

Conferido contra a spec, seção por seção:

- §1 Acesso → Tasks 5 (permissão, flag) e 8 (guardas). §2 Dados → Task 5. §3 Motor → Tasks 1–4. §4 Telas → Tasks 9–12. §5 Escritas → Tasks 8, 11, 12. §8 Testes → distribuídos nas tasks donas do código. §9 Fatias → as doze tasks são as cinco fatias da spec, abertas em unidades com ciclo de teste próprio.
- §6 (fora de escopo) e §7 (Atividade) não geram task, por definição.
- Os cinco itens do Review Focus têm teste: (1) e (2) na Task 1, (3) na Task 4, (4) na Task 1, (5) na Task 3.
- Nomes conferidos entre tasks: `calcularAscendente`, `calcularDescendente`, `distribuirCanais`, `aplicarCenario`, `compararCenario`, `parseMoedaParaCentavos`, `formatarReais`, `formatarVolume`, `requireFunnelScope`, `requireFunnelManager`, `revalidateFunnelScope`, `salvarEtapas`, `salvarCanais`, `salvarCenario` — usados nas tasks posteriores com a mesma grafia com que são declarados.
- **Risco anotado:** `salvarEtapas` recria as etapas com ids novos, o que apaga em cascata as taxas de cenário. A Task 12 tem teste para isso, e a UI deve avisar antes de salvar uma mudança de etapas quando existir cenário com taxa própria.
