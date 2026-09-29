# Canvas Funil de Vendas — design

Data: 2026-09-29. Desenho aprovado em conversa; **esta spec ainda não foi lida
pelo usuário** no momento da escrita.

## Objetivo

Uma ferramenta em **Comercial > Vendas** (e Marketing, mesma base) que responde
a uma pergunta: **quantas prospecções são necessárias para bater a meta?**

A origem é o canvas impresso "Canvas Funil de Vendas" (Flex Marketing Digital /
Funil de Vendas), organizado em cinco blocos numerados. A ferramenta digitaliza
os cinco, mas não como formulário: os blocos 1, 2, 3 e 5 viram um **motor de
cálculo**, e o bloco 4 amarra o resultado a quem tem de entregá-lo.

| Bloco do canvas | Na ferramenta |
|---|---|
| 1 · Definição da meta | Meta (R$) e Ticket Médio (R$) → conversões necessárias |
| 2 · Definição das etapas | Etapas configuráveis, 3 a 6, nome livre |
| 3 · Taxas e regras de transição | Taxa por etapa + texto da regra; cálculo de baixo para cima |
| 4 · Canais de venda | Canais com estratégia/frequência e fatia do topo |
| 5 · Simulações | Cenários nomeados, salvos, comparados com o plano |

## Decisões do usuário

Tomadas em conversa, 29/09:

1. **Calculadora viva**, não documento de preenchimento. O coração é o número.
2. **Vários canvases, por período.** Cada um com nome, data e meta próprias.
3. **Aba em Vendas e Marketing, base compartilhada.** Todos do setor veem;
   editar meta e taxas é de Gestor/Admin.
4. **Etapas configuráveis por canvas**, 3 a 6, com modelo sugerido na criação.
5. **Canais com número e texto.** A soma das fatias é conferida contra 100%.
6. **Cenários salvos e comparáveis** com o plano.

## Contexto que decidiu o desenho

- **`FUNNEL` em [funnel.ts](../../../src/lib/funnel.ts) é outro funil.** Ele
  classifica *conteúdo* (TOFU/MOFU/BOFU de um post do Cronograma). O funil desta
  spec mede *volume comercial*. Vocabulários separados, módulos separados: nada
  em `src/lib/sales-funnel/` importa de `funnel.ts`, e vice-versa. A aba se
  chama **Funil de Vendas**, não "Funil", para a diferença aparecer na tela.
- **O Cronograma é o molde.** Já é uma ferramenta de setor, ligada por flag no
  subsetor, com base compartilhada Vendas→Marketing via `appsSourceId`. O Funil
  repete a estrutura em vez de inventar outra.
- **[permissions.ts](../../../src/lib/permissions.ts)**: "Qualquer condicional
  de UI deve derivar daqui — nunca comparar Role direto no componente". Logo,
  permissão nova.
- **[cronograma-guards.ts](../../../src/lib/cronograma-guards.ts)** mora num
  módulo **sem `"use server"`** de propósito: exportar guarda de dentro de um
  arquivo de actions a transformaria em endpoint chamável pelo navegador. O
  Funil repete o cuidado.
- **Não existe valor monetário no schema hoje.** Esta spec estabelece a
  convenção (ver §2.1).
- **`ActivityEvent`** traz no schema a regra que decide a §7: "Só entra aqui o
  que não pode ser derivado... duplicá-los aqui criaria duas verdades sobre o
  mesmo fato".

## 1. Acesso e escopo

- Permissão nova **`funnel.manage`** na matriz, concedida a `GESTOR` e `ADMIN`.
- Flag nova **`Subsector.funnelEnabled`**, no molde de `scheduleEnabled`.
  Ligada em **Vendas** (dono da base); Marketing e Criação herdam por
  `appsSourceId`, sem configuração própria.
- **Ver** o funil: quem tem acesso ao setor (`resolveAccessibleSlugs` /
  `canAccessSlug`, como já faz a página do setor).
- **Criar, editar, arquivar, salvar cenário**: `funnel.manage`.
- **Colaborador** vê o plano e pode mexer nos controles de simulação na tela —
  o cálculo roda no cliente. Só **salvar** o cenário é barrado.
- A resolução do escopo é **no servidor**, via `resolveAppScope(slug)`, que já
  devolve o subsetor dono da base. O cliente nunca informa qual escopo ler.

## 2. Dados

### 2.1 Convenção de dinheiro

**No banco: `Decimal(14,2)`. No motor de cálculo: centavos como inteiro.**

`Float` não guarda dinheiro: uma meta de R$ 50.000,00 vira 49999.99999999999 e
o erro se propaga na divisão que define as conversões. A camada de dados
converte `Decimal` → inteiro de centavos na fronteira, o motor trabalha só com
inteiros (divisão e multiplicação exatas), e a UI formata de volta para R$.

As **taxas** continuam `Float`, em porcento. Taxa é fração por natureza, e todo
volume derivado dela passa por arredondamento para inteiro de qualquer forma.

### 2.2 Modelos

```prisma
enum SalesFunnelStatus { RASCUNHO ATIVO ARQUIVADO }

model SalesFunnel {
  id            String  @id @default(cuid())
  name          String                      // o campo FUNIL do canvas
  referenceDate DateTime                    // o campo DATA
  goalAmount    Decimal @db.Decimal(14,2)   // Meta Global
  averageTicket Decimal @db.Decimal(14,2)   // Ticket Médio
  status        SalesFunnelStatus @default(RASCUNHO)
  notes         String? @db.Text

  subsectorId String
  subsector   Subsector @relation(fields: [subsectorId], references: [id], onDelete: Cascade)
  createdById String?
  createdBy   User?   @relation("SalesFunnelAuthor", fields: [createdById], references: [id], onDelete: SetNull)

  stages    FunnelStage[]
  channels  FunnelChannel[]
  scenarios FunnelScenario[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([subsectorId, referenceDate])
  @@index([subsectorId, status])
}

model FunnelStage {
  id       String @id @default(cuid())
  funnelId String
  funnel   SalesFunnel @relation(fields: [funnelId], references: [id], onDelete: Cascade)

  order Int
  label String
  /// Taxa de conversão DESTA etapa para a seguinte, em %. A última etapa
  /// converte em negócio ganho — por isso são N etapas e N taxas, sem uma
  /// tabela de transições separada.
  conversionRate Float
  /// "Atividades que condicionam a mudança de etapa" (bloco 3 do canvas).
  transitionRule String? @db.Text

  scenarioRates FunnelScenarioRate[]

  @@unique([funnelId, order])
  @@index([funnelId])
}

model FunnelChannel {
  id       String @id @default(cuid())
  funnelId String
  funnel   SalesFunnel @relation(fields: [funnelId], references: [id], onDelete: Cascade)

  order    Int
  label    String
  /// "Qual a estratégia e frequência" (as caixas tracejadas do topo).
  strategy String? @db.Text
  /// Fatia do topo do funil que este canal responde, em %.
  share    Float

  @@unique([funnelId, order])
  @@index([funnelId])
}

model FunnelScenario {
  id       String @id @default(cuid())
  funnelId String
  funnel   SalesFunnel @relation(fields: [funnelId], references: [id], onDelete: Cascade)

  name  String
  notes String? @db.Text
  /// Alavanca 3 do canvas: "melhore o ticket médio". +10 = ticket 10% maior.
  ticketPercent Float @default(0)
  /// Alavanca 1: "aumente a boca do funil". Só vale no modo descendente.
  topPercent    Float @default(0)

  /// Alavanca 2: "melhore as taxas internas".
  rates FunnelScenarioRate[]

  createdById String?
  createdBy   User?   @relation("FunnelScenarioAuthor", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime @default(now())

  @@index([funnelId])
}

/// A taxa que UM cenário dá a UMA etapa. Só existe linha para o que o cenário
/// muda; onde não há linha, a etapa herda a taxa do plano. Evita duplicar o
/// funil inteiro a cada cenário — e um cenário não congela por acidente uma
/// etapa que o plano corrigiu depois.
model FunnelScenarioRate {
  scenarioId String
  scenario   FunnelScenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  stageId    String
  stage      FunnelStage    @relation(fields: [stageId], references: [id], onDelete: Cascade)

  conversionRate Float

  @@id([scenarioId, stageId])
  @@index([stageId])
}
```

## 3. O motor de cálculo

Em **`src/lib/sales-funnel/math.ts`**: entram números, saem números. Sem Prisma,
sem React, sem `Decimal`. Roda **nos dois lados** — no cliente para o resultado
mudar enquanto a pessoa digita, no servidor para os números dos cards da lista
serem confiáveis. Uma implementação só, testada uma vez.

### 3.1 Sentido ascendente — Meta → Prospecções (o padrão)

É a execução que o canvas manda: *"Executar de baixo para cima, chegando ao
número de prospecções necessárias para se bater a meta"* — **"de baixo para
cima divida"**.

```
conversoesNecessarias = ceil(metaCentavos / ticketCentavos)
v[n-1] = ceil(conversoesNecessarias / (taxa[n-1] / 100))
v[i]   = ceil(v[i+1] / (taxa[i] / 100))          para i de n-2 ate 0
topo   = v[0]
taxaExterna = conversoesNecessarias / topo * 100
```

Conferindo com o exemplo impresso: meta R$ 50.000, ticket R$ 1.000 → 50
conversões. Com Proposta→Ganho 20%, Visita→Proposta 50%, Oportunidade→Visita
50%: 250 propostas, 500 visitas, **1.000 oportunidades**. Taxa externa 5%.

### 3.2 Sentido descendente — Capacidade → Faturamento

O outro lado da dica: **"de cima para baixo multiplique"**. A pessoa fixa
quantas prospecções consegue fazer e vê no que dá.

```
v[0]   = topoInformado
v[i+1] = floor(v[i] * taxa[i] / 100)
conversoes = floor(v[n-1] * taxa[n-1] / 100)
faturamentoCentavos = conversoes * ticketCentavos
```

### 3.3 Arredondamento — decisão registrada

**Ascendente arredonda para cima; descendente, para baixo.** Precisa de 249,3
propostas ⇒ 250. Seiscentas prospecções rendem 29,8 vendas ⇒ 29.

Os dois são pessimistas de propósito: um plano que precisa de 249,3 propostas e
registra 249 é um plano que não bate a meta, e uma projeção que promete 29,8
vendas está prometendo uma venda que não existe. É decisão, não consequência —
e cada metade tem teste próprio.

### 3.4 Diagnósticos, não exceções

Dado ruim não derruba a tela: o motor devolve uma lista que a UI exibe.

| Código | Severidade | Quando |
|---|---|---|
| `META_INVALIDA` | erro | meta ≤ 0 |
| `TICKET_INVALIDO` | erro | ticket ≤ 0 |
| `SEM_ETAPAS` | erro | nenhuma etapa |
| `TAXA_INVALIDA` | erro | taxa ≤ 0 ou > 100 (traz o `stageId`) |
| `CANAIS_INSUFICIENTES` | aviso | menos de 5 canais — o canvas pede no mínimo 5 |
| `COBERTURA_INCOMPLETA` | aviso | soma das fatias < 100% |
| `COBERTURA_EXCEDIDA` | aviso | soma das fatias > 100% |

**Erro** impede o cálculo e a tela diz o que falta preencher. **Aviso** calcula
e mostra o alerta ao lado do número. Taxa zero é erro, e não "infinito": não
existe plano com uma etapa que nunca converte.

### 3.5 Cenários

`aplicarCenario(plano, cenario)` devolve um `FunnelInput` novo — ticket ajustado
por `ticketPercent`, taxas substituídas onde o cenário tem linha, o resto
herdado. A comparação com o plano roda os dois pelo mesmo motor e subtrai. Um
cenário nunca tem caminho de cálculo próprio.

## 4. Telas

Nova aba **"Funil de Vendas"** em `CRONOGRAMA_LAYOUT_TABS`
([sector-page.tsx](../../../src/components/sector/sector-page.tsx)), depois de
Cronograma. A aba só entra quando o escopo tem `funnelEnabled`, exatamente como
Cronograma faz com `scheduleEnabled`. O estado vai para a URL em `?aba=`, que a
página já sabe restaurar.

### 4.1 Lista

Cards com nome, período, meta, status e o resultado em uma linha:
*"R$ 50.000 · 50 conversões · 1.000 prospecções"*. Filtro por status; arquivados
escondidos por padrão. Botão **Novo funil** (com `funnel.manage`).

### 4.2 Editor

Na ordem numerada do canvas, para quem conhece a folha se achar:

1. **Meta** — dois campos; abaixo, em destaque, *"Precisaria de 50 conversões"*.
2. **Etapas e taxas** — lista ordenável, 3 a 6, cada uma com nome, taxa, regra
   de transição e o volume calculado. Ao lado, o funil desenhado: a largura de
   cada faixa é proporcional ao volume, então o estrangulamento se vê.
3. **Canais** — nome, estratégia/frequência, fatia em %, e o volume absoluto
   que a fatia representa. Barra de cobertura com o aviso de soma.
4. **Simulações** — cenários lado a lado com o plano, mostrando Δ conversões e
   Δ faturamento.
5. **Glossário** — Cliente / Prospect / Lead, o quadro do rodapé do canvas, como
   texto de ajuda recolhível. É definição estável: vai no código, não no banco.

Um seletor alterna **Meta → Prospecções** e **Capacidade → Faturamento**.

O desenho do funil é SVG inline, no padrão dos gráficos que já existem
([funnel-donut.tsx](../../../src/components/cronograma/funnel-donut.tsx),
[funnel-area-chart.tsx](../../../src/components/cronograma/funnel-area-chart.tsx)):
cor fixa em hex para valer nos dois temas.

## 5. Escritas

- `src/lib/sales-funnel/actions.ts` — com `"use server"`. Criar, editar,
  arquivar, excluir; etapas, canais e cenários.
- `src/lib/sales-funnel/guards.ts` — **sem** `"use server"`. Resolve o escopo,
  confere `funnelEnabled`, confere acesso ao slug e confere `funnel.manage`.
- Etapas e canais são substituídos em **transação**: apagar e recriar a lista
  inteira num `$transaction`, nunca em escritas soltas que possam deixar o funil
  com ordem duplicada ou buraco.
- Revalidação pelo mesmo cuidado de `revalidateScope`: revalida os **outros**
  setores que compartilham a base, nunca o atual — revalidar a rota corrente
  remonta a página e joga o usuário de volta na primeira aba.

## 6. Fora de escopo

- **Perdas e Ganhos** (os blocos do rodapé da folha). Só fazem sentido com
  negócios reais cadastrados. Sem CRM seriam rótulos vazios.
- **Empresa** (cabeçalho impresso). A plataforma já é a empresa.
- **Planejado × realizado.** Depende de cadastrar oportunidades — é outro
  produto, e o usuário descartou explicitamente.
- **Exportar/imprimir em PDF.** Feature própria, não parte do motor.

## 7. Linha do tempo de Atividade

**Fica fora desta entrega.** Decisão minha, registrada para ser revertida sem
custo se o usuário discordar.

O schema de `ActivityEvent` é explícito: *"Só entra aqui o que não pode ser
derivado: login e logout... duplicá-los aqui criaria duas verdades sobre o mesmo
fato, que divergem no dia em que uma das duas for corrigida"*. Logo, **se** o
funil entrar na linha do tempo um dia, entra como **décima fonte derivada**,
lida de `SalesFunnel.createdAt`, e **nunca** como um `ActivityEventKind` novo.

Não entra agora porque a linha do tempo é de atividade do colaborador, e criar
um funil é ato de gestão — o valor é baixo e o custo não é zero. Registrado
aqui para a porta ficar aberta e o caminho, escrito.

## 8. Testes

**Puro, com `node:test`** — `src/lib/sales-funnel/math.test.ts`, roda sem banco:

- o exemplo do canvas (50.000 / 1.000 / 20-50-50) dá exatamente 1.000 no topo;
- ascendente arredonda para cima, descendente para baixo;
- taxa 0 e taxa 101 devolvem `TAXA_INVALIDA`, não infinito nem `NaN`;
- ticket 0 devolve `TICKET_INVALIDO` e nenhum volume;
- canais somando 85% e 115% dão os dois avisos distintos;
- menos de 5 canais avisa mas **não** impede o cálculo;
- cenário sem linha para uma etapa herda a taxa do plano;
- cenário com `ticketPercent` +10 reduz as conversões necessárias;
- ida e volta: descendente com o topo que o ascendente produziu reconstrói as
  conversões (a menos do arredondamento, que o teste assume explicitamente).

**Com banco, `.dbtest.ts`** — `src/lib/sales-funnel/actions.dbtest.ts`:

- Colaborador é recusado ao criar, editar e salvar cenário;
- Gestor de outro setor não escreve no funil de Vendas;
- funil criado em Vendas aparece em Marketing (base compartilhada);
- setor sem `funnelEnabled` recusa a escrita;
- substituir etapas não deixa ordem duplicada nem buraco.

## 9. Entrega em fatias

Cada fatia roda de ponta a ponta antes da seguinte.

1. **Migration + motor + testes.** Sem UI. Verificável com `npm test`.
2. **Provisionamento + aba + lista.** `scripts/setup-funil-vendas.ts`,
   idempotente, no molde de
   [setup-cronograma.ts](../../../scripts/setup-cronograma.ts): liga
   `funnelEnabled` em Vendas e confere os herdeiros. Criar e arquivar funcionam.
3. **Editor: meta, etapas, taxas, funil desenhado.**
4. **Canais e cobertura.**
5. **Cenários e comparação.**

## 10. Risco conhecido

A base de desenvolvimento tem **um usuário, e é Admin**. A regra "Colaborador vê
mas não edita" não é verificável na tela sem criar um segundo usuário pelo DHO.
Por isso ela é coberta por `.dbtest.ts` na fatia 2 — o teste garante a regra
independentemente de existir alguém para clicar.
