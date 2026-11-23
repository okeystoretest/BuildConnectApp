# A planilha semanal do Marketing vira ferramenta

23 de novembro de 2026

**Commitado e empurrado.** `main` e `origin/main` em `2659b0f`. Um commit só,
30 arquivos, +5.161 linhas.

**Verificação ao fim:** `tsc --noEmit` exit 0 · `eslint .` limpo · `npm run
build` limpo · **503/503** testes de unidade · **188/188** testes de banco ·
**tudo clicado no navegador, logado como Gestor**, incluindo o fluxo de
aprovação e a recusa do Kanban sem evidência.

**A árvore de trabalho NÃO está limpa, e não é desta sessão:** os quatro
handoffs antigos continuam marcados como apagados e o `2026-11-11-Progresso.md`
continua não rastreado — exatamente como estavam quando a sessão começou. Não
toquei neles.

---

## 0. ⏳ PENDÊNCIAS

### 0.1 Produção ainda não tem a ferramenta — faltam dois comandos

Nada do que foi feito chega à produção sozinho. O banco de produção precisa de:

```
npx prisma migrate deploy
npm run setup:relatorio          # habilita no Marketing + cria os 12 cartões
```

O `setup` é **idempotente**: rodar duas vezes não duplica cartão, porque a
chave é o `code` (`K-01`…), único por subsetor. Para habilitar em outra área:
`npm run setup:relatorio -- <slug>`.

Enquanto o segundo comando não rodar, a aba simplesmente **não aparece** — não
quebra nada, só não existe.

### 0.2 O prazo de sexta às 18h não cobra ninguém

A planilha dizia *"Entrega toda sexta até 18h"*. A ferramenta **registra** a
hora do envio (e agora de forma confiável, ver §1), mas **não avisa**
ninguém: não há lembrete na quinta, não há alerta de atraso na segunda, e o
gestor não é notificado quando o relatório entra.

**Não foi pedido, e por isso não foi feito.** Se virar necessidade, a base já
existe: `src/lib/notifications/` tem a fila e o envio por WhatsApp, e
`src/app/api/cron/` já tem duas rotas de cron para pendurar a verificação.
Seria uma rota de cron nova e uma consulta — não precisa de infraestrutura.

### 0.3 Decidir se o Kanban deve ficar onde está

Hoje o quadro é uma vista dentro do Relatório Semanal, porque veio das abas 7
e 8 da mesma planilha. Mas ele é **permanente** e os relatórios são semanais —
são ritmos diferentes convivendo numa aba só.

Funciona bem com 12 cartões. Com 60, a vista "Kanban" vira uma tela própria
por mérito. **Não há nada a fazer agora**; fica registrado para quando
incomodar.

---

## 1. O que foi feito — `2659b0f`

### A planilha, lida de verdade antes de qualquer código

`Relatorio-Semanal-Karen-Okey.xlsx`, 10 abas, preenchida pela Karen (Marketing
PJ) toda sexta até as 18h e revisada pelo Carlos no one-on-one de sexta às 16h.

| Aba | O que era | A fórmula que vivia nela |
|---|---|---|
| 1 Instruções | texto de uso | — |
| 2 Entregas da Semana | 21 linhas da rotina, seg→sex | 3 × `COUNTIF` |
| 3 Canais e Métricas | 20 números de 9 canais | `(atual−anterior)/anterior` |
| 4 OKRs Semanais | 9 KRs × 4 colunas de semana | `AVERAGE` com `COUNT=0` → "—" |
| 4 OKRs do Trimestre | **os mesmos 9 KRs**, outra apuração | `realizado/meta` |
| 5 Bloqueios e Decisões | 5 linhas vazias numeradas | — |
| 6 Pauta do One-on-One | 5 perguntas, 40 min | — |
| 7 Kanban | 12 cartões, 5 colunas | — |
| 8 Painel Kanban | resumo automático | `COUNTIF`, `COUNTIFS`, `SUMPRODUCT` |

**Duas redundâncias no arquivo**, que não foram copiadas: as duas abas de OKR
são a mesma lista vista duas vezes (viraram **uma linha** com realizado e meta
lado a lado), e o Kanban repetia quase linha por linha a checklist da aba 2
(continuam separados, porque os estados são diferentes — saúde 🟢🟡🔴 contra
fluxo Backlog→Publicado).

### Nenhuma conta virou coluna no banco

Variação, % da meta, média de 4 semanas, os contadores do rodapé e o painel
inteiro do Kanban saem de `src/lib/weekly-report/math.ts` **na leitura**.

Guardar o resultado ao lado dos números que o produzem criaria uma segunda
verdade, que envelhece na primeira correção de um número — e a planilha não
tinha esse problema justamente porque a célula recalculava.

Duas decisões de borda que mudam o que se lê na sexta:

- Onde a planilha devolvia `#DIV/0!`, a resposta é **"—"**. Crescer de 0 para
  40 não é "+∞%": é crescimento sem base de comparação.
- Onde a célula vazia viraria `0`, a resposta também é **"—"**. Zero diz
  "mediu e deu zero"; traço diz "ninguém mediu". São decisões diferentes.

### Três furos do arquivo, fechados

1. **"Data e hora do envio" e "Data da aprovação" eram células digitadas.**
   Agora são gravadas pelo servidor na ação. Quem entregava atrasado escrevia
   o horário que quisesse.
2. **"Semana nº" e "Período" eram digitados separados**, e a semana 46 com o
   período da 45 era o erro mais comum do arquivo. Agora os dois saem de uma
   data, pela regra **ISO-8601** — a mesma do `WEEKNUM(...;21)`. *O teste
   disso pegou um erro real meu na virada de ano: 04/01/2027 saía como semana
   2.*
3. **"Toda tarefa precisa de evidência antes de ir para Publicado"** era uma
   frase na aba de instruções, que ninguém abria. Agora é a action que recusa
   o movimento, com a frase na tela.

### O escopo NÃO segue a herança de aplicativos

Marketing herda de Vendas os aplicativos e o Cronograma (`appsSourceId`). O
Relatório Semanal **não**: ele pende do próprio subsetor
(`Subsector.weeklyReportEnabled`).

Herdar daria a **Vendas e à Criação** o poder de abrir — e aprovar — a semana
de uma área que não é a deles. O dbtest prova as duas coisas na mesma
montagem: Marketing herda os aplicativos de Vendas E tem o relatório próprio,
e `getWeeklyReportData(vendas)` devolve `null`.

### Quem preenche e quem aprova

- **Preencher não exige permissão** — é o trabalho de quem toca a área.
- **Aprovar** exige a permissão nova `weeklyReport.approve` (Gestor e Admin).
- Relatório **aprovado fecha** para edição. Quem reabre é quem aprova, e
  **reabrir apaga a aprovação** — assinar um relatório que já mudou não
  significa nada.

### As linhas do modelo são cópia, não referência

As 21 entregas, 20 métricas, 9 KRs e 5 blocos de pauta são **copiados** para
o relatório no momento da criação (`src/lib/weekly-report/templates.ts`).

Mudar a rotina em janeiro não pode reescrever o que foi cobrado em dezembro.
Mexer no arquivo de modelos afeta **só as semanas criadas depois**.

### Arquivos

```
prisma/
  migrations/20261123040447_relatorio_semanal_marketing/
  schema.prisma                      6 modelos + 5 enums + weeklyReportEnabled

src/types/weekly-report.ts           o domínio do lado da tela

src/lib/weekly-report/
  templates.ts                       as abas 2,3,4,6,7 transcritas
  math.ts                            as fórmulas + semana ISO
  math.test.ts                       19 testes
  data.ts                            leitura, com os números calculados
  data.dbtest.ts                     13 testes contra o Postgres
  guards.ts                          papel + escopo, SEM "use server"
  actions.ts                         8 actions
  labels.ts                          rótulos e formatação

src/components/weekly-report/        11 componentes
scripts/setup-relatorio-semanal.ts   habilita + semeia o quadro
```

O `guards.ts` é um módulo **sem** `"use server"` de propósito — exportá-lo de
`actions.ts` transformaria as guardas em endpoints chamáveis pelo navegador. É
a mesma decisão de `sales-funnel/guards.ts` e `cronograma-guards.ts`.

---

## 2. Decisões que custaram algo

### Seção inteira numa chamada, não linha a linha

As quatro seções de modelo fixo editam em memória e gravam a seção toda numa
transação (`salvarSecao`). É como a planilha era usada: preenche-se a aba e
fecha-se o arquivo. Vinte linhas em vinte chamadas deixariam a tela num
estado que não existe no banco se a décima falhasse.

**O preço:** o "Salvar" é manual. Não há salvamento automático; sair da página
com a seção suja perde o que foi digitado nela.

**Os bloqueios são a exceção** — ali as linhas nascem e morrem, e cada uma
salva por conta própria.

### O Kanban não arrasta

O cartão troca de coluna por **lista suspensa**. Funciona com teclado, com
leitor de tela e no telefone — e arrastar numa planilha também nunca existiu:
movia-se a célula de status. Uma biblioteca de drag-and-drop custaria uma
dependência para desfazer as três coisas.

### A média de 4 semanas casa os KRs pelo TEXTO

Cada relatório tem as suas próprias linhas de OKR (é o que preserva a
história). A média atravessa os relatórios casando pelo **texto** do
resultado-chave, não por id.

**Consequência, de propósito: renomear um KR reinicia a média dele.** Um KR
renomeado mede outra coisa.

### O `prisma format` mexeu em vizinhos

Os nomes novos de relação são mais longos que os antigos, e o formatador
re-alinhou as colunas dos blocos `User` e `Subsector` inteiros. São ~46 linhas
de diff cosmético no `schema.prisma` que não têm a ver com a ferramenta — é o
que o `prisma format` do próprio projeto produz.

---

## 3. Verificado

### Automático

| | |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint .` | limpo |
| `npm run build` | limpo (`/setores/[slug]` foi para 41,7 kB) |
| `npm test` | **503/503** |
| `npm run test:db` | **188/188** |

Dos testes, **32 são novos**: 19 em `math.test.ts` (cada um citando a célula
de origem na planilha, para conferência lado a lado) e 13 em `data.dbtest.ts`
(escopo, isolamento entre áreas, contadores, média de 4 semanas, trava da
aprovação, unicidade do código do cartão por subsetor).

### No navegador, logado como Gestor

| Teste | Resultado |
|---|---|
| Aba aparece em Comercial > Marketing | ✅ entre Funil de Vendas e Avaliações |
| Modal de nova semana | ✅ abriu em **"48, 23/11 a 27/11"**, derivado sozinho |
| Editor com as 6 seções numa página | ✅ |
| Variação ao vivo: 100000 → 120000 | ✅ **+20,0%**, antes de salvar |
| Salvar seção + "✓ Salvo" | ✅ botão desliga depois de gravar |
| Aviso "1 métrica preenchida sem leitura" | ✅ |
| OKRs mensais destacados | ✅ fundo âmbar + selo "leitura mensal" |
| Pauta somando "40 minutos no total" | ✅ |
| Kanban, 5 colunas, 12 cartões | ✅ |
| **Mover sem evidência para Publicado** | ✅ **recusou**, cartão não saiu do lugar |
| Mover com evidência | ✅ foi, com selo verde |
| Painel (aba 8) | ✅ 12 / 1 / 0 · **91,7% + 8,3% = 100%** · matriz categoria × status |
| Aprovar | ✅ registrou envio e aprovador, botões viraram "Reabrir" |
| Tema escuro | ✅ |

**Como foi testado:** usuário Gestor temporário criado direto no banco de dev,
logado pelo fluxo real, **apagado ao fim** junto com o relatório de teste e o
link falso de evidência. O Marketing ficou com `weeklyReportEnabled: true` e
os 12 cartões originais, zero semanas. O dev foi parado — estava parado
quando a sessão começou.

---

## 4. Não verificado

- **Largura de celular.** As tabelas de entregas (920 px) e de métricas
  (1000 px) rolam na horizontal dentro da aba. Em 1568 px cabe sem rolagem; em
  telefone, não foi visto.
- **Papel de Colaborador na tela.** A trava do relatório aprovado para quem
  não aprova está coberta pelo dbtest (`canEdit === false`), mas a faixa
  "Relatório aprovado, peça ao gestor para reabri-lo" não foi vista
  renderizada.
- **Um relatório com todas as seções cheias.** Preenchi uma métrica e uma
  entrega; o resto ficou vazio. Nada sugere problema, mas não foi visto.
- **Média de 4 semanas na tela.** Está coberta pelo dbtest com dois
  relatórios; no navegador só existia uma semana, então a coluna mostrou "—".

## 5. Limites conhecidos

- **Não há salvamento automático.** Ver §2.
- **Renomear um KR reinicia a média de 4 semanas.** De propósito. Ver §2.
- **O código do cartão (`K-13`) sai do maior existente**, não da contagem.
  Excluir o `K-12` e criar outro dá `K-13`, não `K-12` de novo — o código é
  como a tarefa é citada na reunião, e reaproveitá-lo confundiria a ata.
- **Um relatório por semana em cada área**, garantido por `@@unique`. Criar a
  mesma sexta duas vezes devolve "Já existe um relatório para esta semana".
- **A ferramenta não exporta.** A planilha era um arquivo que se mandava por
  e-mail; isto é uma tela. Se a entrega ao Carlos precisar sair do sistema, é
  trabalho novo — e `src/lib/pdf/` já existe no projeto.

## 6. Nota sobre dado de desenvolvimento

Durante os testes, foram criados e depois **apagados**: um usuário Gestor
temporário (`#QA-RELSEM`) e um relatório da semana 48 com números fictícios.
Os 12 cartões do Kanban do Marketing foram devolvidos ao Backlog, sem
evidência e sem data de conclusão. Nenhum outro dado foi tocado.
