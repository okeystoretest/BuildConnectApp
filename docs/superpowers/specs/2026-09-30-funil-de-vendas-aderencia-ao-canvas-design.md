# Funil de Vendas — aderência à metodologia do canvas

Data: 30/09/2026 · Origem: auditoria de lógica de cálculo contra a metodologia
do "Canvas do Funil de Vendas"

## O problema

A ferramenta acerta o princípio — calcula de baixo para cima, a partir da meta,
dividindo por cada taxa — e erra em três coisas que a auditoria mediu rodando o
motor, não lendo o código:

1. **As simulações do bloco 5 respondem à pergunta oposta.** `compararCenario`
   roda os dois lados no motor ascendente, com a meta travada. No sentido
   ascendente, melhorar qualquer alavanca não aumenta faturamento — reduz
   esforço. Medido: melhorar a taxa de entrada de 33% para 40% dá ganho de
   **R$ 0,00** onde o canvas espera +R$ 17.047,95; ticket +10% aparece como
   **perda de R$ 1.712,36**.
2. **Não há plano de ação.** Não existem vendedores nem dias úteis em nenhuma
   camada — schema, motor ou tela. Sem eles não há "oportunidades por vendedor
   por dia", que é o que se cobra do vendedor e o ponto final da metodologia.
3. **O arredondamento é para cima onde a referência arredonda ao mais
   próximo.** Medido: 36/90/150/455 contra 35/88/147/445.

`topPercent` — a alavanca "aumente a boca do funil" — é persistida, validada e
lida, e nenhum cálculo a aplica.

## O caso de teste que governa esta spec

Entradas: meta R$ 75.000 · ticket R$ 2.140,65 · 4 vendedores · 22 dias úteis ·
etapas 33% / 60% / 40%.

| Item | Esperado |
| --- | --- |
| Negócios fechados | 35 |
| Propostas | 88 |
| Visitas | 147 |
| Oportunidades | 445 |
| Conversão geral | 7,87% (35/445) |
| Oportunidades por vendedor | 111 (111,25) |
| Oportunidades por vendedor/dia | 5 (5,06) |
| S1, 6 por vendedor/dia | topo 528 → 42 negócios → R$ 89.907,30 → ganho R$ 14.907,30 |
| S2, taxa de entrada 40% | 178 visitas → 107 propostas → 43 negócios → R$ 92.047,95 → ganho R$ 17.047,95 |

Todos estes valores foram reproduzidos numericamente antes desta spec ser
escrita. O S1 cai no valor exato da referência (42), não na variante de 41: com
arredondamento ao mais próximo, 528 → 174 → 104 → 42, porque 104 × 0,40 = 41,6.

## Seção 1 — A regra de arredondamento

Uma primitiva só, em `math.ts`, substituindo `dividirParaCima` e o
`Math.floor` do descendente:

```ts
/** Arredonda ao mais próximo, empate para cima, sem ponto flutuante. */
function arredondar(numerador: number, denominador: number): number {
  return Math.floor((2 * numerador + denominador) / (2 * denominador));
}
```

Continua inteira: `2 × numerador` chega a 2×10¹³ contra os 9×10¹⁵ de
`Number.MAX_SAFE_INTEGER`. Mantém a invariante que o arquivo já documenta e
pela qual os achados I1 e I2 da revisão anterior foram corrigidos — a divisão
em ponto flutuante erra por um para taxas comuns, e isto não reintroduz o
defeito.

**Empate sobe.** 87,5 → 88, que é o que a referência faz e também o lado
comercialmente seguro.

**Exceção deliberada, a única:** `conversoesNecessarias` ganha piso de 1.

```ts
return Math.max(1, arredondar(goalCents, ticketCents));
```

Sem o piso, uma meta de R$ 300 com ticket de R$ 1.000 daria zero conversões e
um funil inteiro zerado, sem diagnóstico nenhum. O piso preserva a invariante
"ticket maior que a meta ainda exige UMA conversão, nunca zero".

Aplicação: conversões necessárias, cada etapa do ascendente, cada etapa do
descendente e o volume por canal. O volume por canal passa de `Math.ceil` para
`arredondar` pela consistência que é o sentido da mudança; o efeito colateral é
que 33,33% de 1.000 dá 333 e não 334.

**Não muda:** a conversão geral (`externalRate`) segue exata, sem arredondar —
já estava certo e é o que a metodologia manda usar nas simulações.

## Seção 2 — O plano de ação

### Banco

`SalesFunnel` ganha duas colunas **nulas**:

```prisma
/// Quantos vendedores dividem o esforço. Nulo = equipe não declarada.
sellerCount Int?
/// Dias úteis do período a que este funil se refere.
workingDays Int?
```

Nulas de propósito: funis já salvos não têm equipe declarada, e se V e D
entrassem em `erros()` todo funil existente pararia de desenhar. Sem equipe o
funil calcula igual — só não mostra plano de ação.

### Motor

Módulo novo, `src/lib/sales-funnel/plano-de-acao.ts`, puro, que não toca
`math.ts`:

```ts
export interface Equipe {
  vendedores: number;
  diasUteis: number;
}

export interface EsforcoEtapa {
  id: string;
  label: string;
  volume: number;
  /** Inteiro cobrável. */
  porVendedor: number;
  /** O mesmo valor sem arredondar, duas casas. */
  porVendedorExato: number;
  porVendedorDia: number;
  porVendedorDiaExato: number;
}

/** null quando não há equipe declarada ou quando V ou D não são positivos. */
export function planoDeAcao(
  resultado: FunnelResult,
  equipe: Equipe | null,
): EsforcoEtapa[] | null;
```

`math.ts` não passa a conhecer vendedores. É a fronteira que faz os dois serem
testáveis em separado, e é o que impede o motor de crescer mais — ele já está
em 299 linhas.

### Tela

O painel de resultado ganha o bloco, com o inteiro em destaque e o exato ao
lado:

```
Oportunidades   111 / vendedor    5 / dia     (111,25 · 5,06)
Visitas          37 / vendedor    2 / dia     ( 36,75 · 1,67)
Propostas        22 / vendedor    1 / dia     ( 22,00 · 1,00)
```

O exato ao lado existe para ninguém concluir que 2 visitas/dia × 22 dias × 4
vendedores fecha as 147 visitas. Sem equipe declarada, o bloco não aparece.

## Seção 3 — As simulações passam a descer

`compararCenario` inverte o sentido do lado direito: o **plano sobe** (meta →
445 no topo) e o **cenário desce a partir desse mesmo topo**, com as alavancas
aplicadas. A regra, em uma frase: *o plano define a atividade; o cenário
projeta o resultado daquela atividade*.

### As três alavancas

| Alavanca | Como entra |
| --- | --- |
| Melhore as taxas internas | `rates`, como hoje: substitui a taxa da etapa no desenho descendente |
| Melhore o ticket médio | `ticketPercent`, como hoje; o faturamento é conversões × ticket do cenário |
| Aumente a boca do funil | **`opportunitiesPerSellerDay`**, nova: o topo é `arredondar(porDia × D × V)` |

`topPercent` sai. A alavanca por dia fala a língua do canvas — atividade diária
cobrável — e só é expressável porque V e D passam a existir. Os 528 da
referência saem de 6 × 22 × 4; como percentual seriam "+18,65%", que ninguém
digita nem confere de cabeça.

Ordem de precedência do topo do cenário: a alavanca por dia, se preenchida;
senão, o topo do plano.

### O ganho é medido contra a meta

`ScenarioComparison` troca `deltaRevenueCents` por:

```ts
/** Faturamento do cenário menos a META. null quando o cenário tem erro. */
ganhoCents: number | null;
```

Contra a meta, e não contra o faturamento do plano, porque o faturamento do
plano (R$ 74.922,75 no caso de teste) é ele mesmo artefato do arredondamento:
comparar com ele daria R$ 17.125,20 onde a metodologia pede R$ 17.047,95. É
`null` quando o cenário tem erro, para a tela não exibir o ganho de um cálculo
que não existe.

`deltaConversions` fica, com significado novo e mais útil: quantos negócios a
mais o cenário fecha.

### Diagnóstico novo

`EQUIPE_AUSENTE` — usar a alavanca por dia num funil sem V e D é erro **dentro
do cenário**, nunca no plano.

### Banco

`SalesFunnelScenario` perde `topPercent` e ganha `opportunitiesPerSellerDay
Float?`. Antes do `DROP COLUMN`, conferir que a coluna só contém zeros:

```sql
SELECT count(*) FROM "SalesFunnelScenario" WHERE "topPercent" <> 0;
```

Se voltar qualquer coisa diferente de 0, parar e avisar em vez de descartar
dado. Nunca houve campo na tela que alterasse `topPercent` — `scenario-modal`
grava `0` fixo —, então o esperado é zero linhas.

### Tela

A lista de cenários troca a coluna "topo" — que passa a ser quase sempre igual
à do plano — por **ganho em R$**. O "Efeito" do modal passa a ler:

```
Plano:    445 no topo → 35 negócios → meta R$ 75.000,00
Cenário:  445 no topo → 43 negócios → R$ 92.047,95   (+R$ 17.047,95)
```

> **Desvio na implementação (05/10/2026).** A coluna "Prosp." **ficou**: a
> lista mostra as três — Negóc. · Prosp. · Ganho. A premissa desta seção era
> que o topo do cenário seria "quase sempre igual ao do plano", o que valia
> enquanto a terceira alavanca era o `topPercent` inerte. Com
> `opportunitiesPerSellerDay` o topo volta a variar — é justamente o que a S1
> do canvas faz, 445 → 528 —, e retirar a coluna esconderia o efeito da
> alavanca que esta mesma spec introduziu.

## Seção 4 — Bordas

| Caso | Comportamento |
| --- | --- |
| V ou D ausentes | Funil calcula; sem bloco de plano de ação. Nenhum erro novo. |
| V = 0, D = 0, negativos, fracionários | Recusados no Zod, mensagem em português; `planoDeAcao` devolve `null` por defesa |
| Alavanca por dia sem V/D | `EQUIPE_AUSENTE`, só no resultado do cenário |
| Alavanca por dia estourando o teto | Cai no `VOLUME_IRREAL` que `calcularDescendente` já tem |
| Cenário sem alavanca nenhuma | Idêntico ao plano |
| `ticketPercent = -100` | Segue dando `TICKET_INVALIDO`; `ganhoCents` fica `null` |
| Meta menor que o ticket | 1 conversão, pelo piso |

O "idêntico ao plano" não é suposição: a deriva do ida-e-volta (meta → topo →
de volta às conversões) foi varrida em **54.867 combinações** de três taxas
sobre a grade 1 / 2,3 / 5 / 7 / 12,5 / 18 / 20 / 25 / 29 / 33 / 33,33 / 40 /
50 / 60 / 66,67 / 75 / 80 / 95 / 100 por volumes 1 / 7 / 35 / 50 / 137 / 290 /
1.000 / 4.321, e deu **zero em todas**.

## Seção 5 — Verificação

### Testes que mudam de valor

| Teste | Hoje | Depois |
| --- | --- | --- |
| `descendente arredonda para BAIXO: 599 … 29` | `[599,299,149]`, 29 conversões | `[599,300,150]`, 30 — o título se inverte |
| `ascendente arredonda para CIMA: 205,5 … 206` | 206 | 206: mesmo valor, nome errado. Renomear e somar um caso que distinga as regras — 100 conversões a 3% dão 3.333, não 3.334 |
| `ida e volta … pessimista nos dois sentidos` | `assert >=` | `assert` de igualdade, com a varredura anexada |
| `nenhuma taxa de um décimo erra por um` | oráculo `Math.ceil` | oráculo half-up |
| os 5 de `scenario.test.ts` | premissa "reduz esforço" | premissa "projeta faturamento" — reescrita inteira |

### Testes que não mudam, e que provam que nada quebrou

O exemplo do canvas impresso (50 conversões, 1.000 oportunidades — todas as
divisões são exatas), os dois casos I1, o caso I2, os sete de canais, e todos
os de `parseMoedaParaCentavos`.

### Testes novos

- A varredura do ida-e-volta, no estilo da que já existe para as taxas de um
  décimo: se a aritmética voltar ao ponto flutuante ou a regra mudar por
  acidente, falha em massa.
- O piso de uma conversão, com um caso abaixo de 0,5 — que é o que o teste
  atual não cobre.
- `plano-de-acao.ts` inteiro: derivação, arredondamento, ausência de equipe,
  V ou D inválidos.
- **O caso de teste desta auditoria**, travado como regressão: a cadeia base,
  a conversão geral, o plano de ação, S1 e S2 com os valores da tabela acima.

### Comandos

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. O `npm run
test:db` passa a ser obrigatório nesta rodada, ao contrário da anterior: há
migração e `actions.dbtest.ts` toca `topPercent`.

## Seção 6 — Fora de escopo

**Incluído por custar uma string:** renomear "Taxa externa" para "Conversão
geral", que é o vocabulário da metodologia.

**Deixado de fora, deliberadamente:** aviso quando a taxa informada tem mais de
duas decimais (`pontosBase` trunca 33,333% em 33,33% em silêncio); distinção
cross-sell / up-sell na alavanca de ticket; campo de ticket absoluto no cenário.
São de severidade baixa e engrossariam um escopo que já são quinze arquivos.

**Minors herdados, não tratados:** contador de módulo gerando ids instáveis
entre servidor e cliente em `funnel-editor.tsx`; "Salvar" como três escritas sem
rollback; mensagem crua do Zod em inglês; data de referência montada sem "Z";
`gravarCenario` lendo as etapas fora da transação.

## Arquivos

| Arquivo | O que muda |
| --- | --- |
| `prisma/schema.prisma` | `sellerCount`, `workingDays`; `topPercent` → `opportunitiesPerSellerDay` |
| `prisma/migrations/…_funil_plano_de_acao/migration.sql` | novo |
| `src/lib/sales-funnel/math.ts` | `arredondar`, piso de 1, ascendente, descendente, canais |
| `src/lib/sales-funnel/math.test.ts` | rebase dos valores, varredura nova |
| `src/lib/sales-funnel/plano-de-acao.ts` | **novo** |
| `src/lib/sales-funnel/plano-de-acao.test.ts` | **novo** |
| `src/lib/sales-funnel/scenario.ts` | inverte o sentido; `ganhoCents` |
| `src/lib/sales-funnel/scenario.test.ts` | reescrito |
| `src/lib/sales-funnel/types.ts` | `ScenarioInput`, `ScenarioComparison`, `EQUIPE_AUSENTE` |
| `src/lib/sales-funnel/actions.ts` | Zod de V, D e da alavanca |
| `src/lib/sales-funnel/data.ts` | leitura de V, D e da alavanca |
| `src/lib/sales-funnel/actions.dbtest.ts` | `topPercent` → alavanca nova |
| `src/components/sales-funnel/funnel-editor.tsx` | campos de V e D |
| `src/components/sales-funnel/funnel-result.tsx` | bloco do plano de ação; rótulo |
| `src/components/sales-funnel/scenario-modal.tsx` | campo da alavanca; "Efeito" com ganho |
| `src/components/sales-funnel/scenarios-section.tsx` | coluna de ganho |
| `src/components/sales-funnel/new-funnel-modal.tsx` | V e D na criação |

## Nota de sequenciamento

Esta rodada começa sobre nove arquivos não commitados da rodada de UI anterior,
três deles — `funnel-result.tsx`, `funnel-editor.tsx`, `scenario-modal.tsx` — os
mesmos que este trabalho volta a mexer. Decisão do autor: seguir direto, sem
commitar a rodada anterior primeiro. O efeito conhecido é que os commits desta
rodada carregam também o layout da anterior.
