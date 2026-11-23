# O Relatório Semanal do Marketing

Começado em 23 de novembro de 2026 · **atualizado em 24 de novembro de 2026**

Este documento descreve a ferramenta **como ela está agora**. Ela mudou em seis
commits depois do primeiro, e o que estava escrito aqui antes descrevia uma
tela que não existe mais — aprovação, listas prontas, Kanban sem arrasto.

| Commit | O que mudou |
|---|---|
| `2659b0f` | A planilha virou ferramenta |
| `dd84410` | As listas pré-preenchidas saíram; o Kanban passou a arrastar |
| `1a50c63` | O relatório virou seis passos; o Kanban ganhou a página inteira |
| `4eab79f` | O responsável do cartão virou gente da plataforma; saiu o "Mover para" |
| `2e569a1` | A semana nova se preenche dentro do modal; saíram Enviar e Aprovar |
| `d1709a6` | O card ficou visual; clicar nele passou a abrir a LEITURA |
| `357852f` | O bloqueio digitado também é gravado pelo "Próximo" |

**Verificação ao fim:** `tsc --noEmit` exit 0 · `eslint` limpo · `npm run
build` limpo · **503/503** testes de unidade · **188/188** testes de banco ·
**uma semana inteira preenchida e conferida no navegador**, logada como Gestor.

---

## 0. ⏳ PENDÊNCIAS

### 0.1 Produção ainda não tem a ferramenta — faltam dois comandos

Nada do que foi feito chega à produção sozinho:

```
npx prisma migrate deploy
npm run setup:relatorio          # habilita no Marketing + cria os 12 cartões
```

São **duas** migrations a aplicar (`20261123040447_relatorio_semanal_marketing`
e `20261123140323_tarefa_responsavel_vira_usuario`).

O `setup` é **idempotente**: rodar duas vezes não duplica cartão, porque a
chave é o `code` (`K-01`…), único por subsetor. Para habilitar em outra área:
`npm run setup:relatorio -- <slug>`.

Enquanto o segundo comando não rodar, a aba simplesmente **não aparece** — não
quebra nada, só não existe.

### 0.2 Nada tranca a semana depois que ela é lida

Este é o buraco que nasceu quando Enviar e Aprovar saíram (§3). Hoje
**qualquer pessoa da área pode reescrever uma semana já discutida na reunião**,
inclusive meses depois, sem deixar rastro de que mudou.

Se incomodar, o caminho barato não é trazer o ciclo de volta: é **fechar a
semana para edição depois de um prazo** (duas semanas, por exemplo) e deixar a
reabertura com quem tem `weeklyReport.approve`. Uma condição em `abrirRelatorio`
e uma linha no `canEdit` — o lugar onde a trava da aprovação morava e continua
de pé para quem marcar o estado por fora.

### 0.3 O prazo de sexta às 18h não cobra ninguém

A planilha dizia *"Entrega toda sexta até 18h"*. A ferramenta **não avisa**
ninguém: não há lembrete na quinta, não há alerta de atraso na segunda, e o
gestor não é notificado quando a semana é preenchida.

**Não foi pedido, e por isso não foi feito.** Se virar necessidade, a base já
existe: `src/lib/notifications/` tem a fila e o envio por WhatsApp, e
`src/app/api/cron/` já tem duas rotas de cron para pendurar a verificação.

### 0.4 Decidir se o Kanban deve ficar onde está

Hoje o quadro é uma vista dentro do Relatório Semanal, porque veio das abas 7
e 8 da mesma planilha. Mas ele é **permanente** e os relatórios são semanais —
são ritmos diferentes convivendo numa aba só. Funciona bem com 12 cartões; com
60, a vista "Kanban" vira uma tela própria por mérito.

### 0.5 Celular está fora do escopo — mas o arrasto não funciona lá

Decidido em 24/11: o foco não é celular. Fica registrado o que isso significa
— o arrasto do Kanban usa o recurso nativo do HTML, que **não cobre toque**.
Num telefone, mover cartão não funciona; sobram as setas do teclado (que num
telefone também não existem) e abrir a ficha.

---

## 1. Como a ferramenta funciona hoje

### A lista de semanas

Cada semana é um card que se lê de relance: **a barra do quanto já foi
respondido** ("5 de 8 entregas"), os sinais 🟢🟡🔴 **que existem** (os zeros não
aparecem — três zeros em toda semana nova eram ruído), **as duas primeiras
linhas do destaque** e quem criou.

- **Clicar no card abre a LEITURA.**
- **O lápis abre a EDIÇÃO.**

### A leitura

Um modal com a mesma moldura do preenchimento — abas em cima, um bloco por vez
—, e uma regra que é a razão dele existir: **só aparece o que foi preenchido**.
Campo em branco não vira linha vazia, bloco sem nada não vira aba, e a pauta
mostra **só pergunta respondida** (ela nasce com cinco prontas; sem o filtro,
toda semana nova abriria exibindo exatamente o que esta tela existe para não
mostrar). Semana intocada diz isso em uma linha.

### A semana nova

"Nova semana" abre o fluxo em etapas dentro do modal:

1. **Quando é a semana** — número e período, derivados da data de hoje pela
   regra ISO-8601. É esta página que cria o relatório e dá aos blocos um lugar
   para gravar.
2. a 7. **Os seis blocos**, um por página, com barra de progresso e
   Anterior/Próximo. O último passo chama **Salvar**, fecha o modal e a semana
   fica no card.

**"Próximo" grava o bloco à vista.** Sem isso, o fluxo em etapas seria o melhor
lugar possível para perder texto: concluir fecha a janela.

### A edição

Os mesmos seis blocos, um por vez, com as abas para pular direto. No cabeçalho,
**um "Salvar"** que grava todo bloco com algo pendente — e cada bloco mantém o
seu próprio, porque uma sexta interrompida no meio das métricas não pode perder
as entregas já respondidas. A lixeira (excluir a semana) só aparece para quem
tem `weeklyReport.approve`.

Recarregar a página volta para a **leitura**, que é o modo seguro dos dois.

### O quadro Kanban

Cinco colunas — **Brainstorm**, A fazer, Em andamento, Revisão, Publicado. O
nome da primeira mudou em 24/11: é onde a ideia nasce, não uma fila de
pendência. **No banco o valor continua `BACKLOG`** — renomear o enum custaria
uma migration em todos os cartões para mudar uma palavra na tela.

- **Arrasta** (recurso nativo, sem dependência) e, com o cartão em foco, **← e
  →** movem entre colunas, com o foco acompanhando o cartão na coluna nova.
- **Nada chega a Publicado sem evidência** — a action recusa, com a frase na
  tela.
- O cartão mostra a **foto de quem toca a tarefa** (ou as iniciais); sem
  responsável, o círculo fica tracejado em vez de sumir.
- **Cinco cartões e a coluna para de crescer**; o resto rola dentro dela.
- A ficha do cartão é **só de leitura**: mover é trabalho do quadro.

Na vista Kanban a página fica larga; nas semanas, na coluna de leitura.

---

## 2. De onde veio

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

**Duas redundâncias do arquivo não foram copiadas:** as duas abas de OKR são a
mesma lista vista duas vezes (viraram **uma linha** com realizado e meta lado a
lado), e o Kanban repetia quase linha por linha a checklist da aba 2 (continuam
separados, porque os estados são diferentes — saúde 🟢🟡🔴 contra fluxo
Brainstorm→Publicado).

### Nenhuma conta virou coluna no banco

Variação, % da meta, média de 4 semanas, os contadores do rodapé e o painel
inteiro do Kanban saem de `src/lib/weekly-report/math.ts` **na leitura**.
Guardar o resultado ao lado dos números que o produzem criaria uma segunda
verdade, que envelhece na primeira correção de um número.

Duas decisões de borda que mudam o que se lê na sexta:

- Onde a planilha devolvia `#DIV/0!`, a resposta é **"—"**. Crescer de 0 para
  40 não é "+∞%": é crescimento sem base de comparação.
- Onde a célula vazia viraria `0`, a resposta também é **"—"**. Zero diz
  "mediu e deu zero"; traço diz "ninguém mediu".

### Dois furos do arquivo, fechados

1. **"Semana nº" e "Período" eram digitados separados**, e a semana 46 com o
   período da 45 era o erro mais comum do arquivo. Agora os dois saem de uma
   data, pela regra **ISO-8601** — a mesma do `WEEKNUM(...;21)`. *O teste disso
   pegou um erro real meu na virada de ano: 04/01/2027 saía como semana 2.*
2. **"Toda tarefa precisa de evidência antes de ir para Publicado"** era uma
   frase na aba de instruções, que ninguém abria. Agora é a action que recusa o
   movimento.

O terceiro furo que o arquivo tinha — "data do envio" e "data da aprovação"
como células digitadas — deixou de existir junto com o ciclo (§3).

### A semana NÃO nasce com as listas prontas

As 21 entregas, 20 métricas e 9 KRs da planilha **saíram** em `dd84410`: linha
que não se apaga vira linha que se ignora, e uma semana que abre com 50 linhas
vazias é um formulário, não um relatório. Entregas, métricas e OKRs são
adicionados conforme a semana pede.

**Só a pauta nasce pronta** (as 5 perguntas do one-on-one, 40 minutos), porque
ali a lista é o roteiro da conversa, não o trabalho da semana.

### O escopo não segue a herança de aplicativos

Marketing herda de Vendas os aplicativos e o Cronograma (`appsSourceId`). O
Relatório Semanal **não**: ele pende do próprio subsetor
(`Subsector.weeklyReportEnabled`). Herdar daria a Vendas e à Criação o poder de
abrir a semana de uma área que não é a deles. O dbtest prova as duas coisas na
mesma montagem.

---

## 3. Decisões que custaram algo

### Enviar e Aprovar saíram inteiros

O ciclo "rascunho → enviado → aprovado" existia desde o primeiro commit e saiu
em `2e569a1`, a pedido. A action das três transições foi junto: sem botão, ela
seria um endereço do servidor que ninguém chama e qualquer um pode chamar.

**O que ficou:** as colunas `status`, `submittedAt` e `approvedAt` continuam no
banco, sem ninguém escrevendo nelas. Apagá-las é migration destrutiva, e se a
aprovação voltar um dia o histórico está lá. A trava do relatório aprovado
continua de pé em `abrirRelatorio` — uma semana marcada assim por fora não
volta a aceitar escrita de quem não aprova.

**O que se perdeu:** §0.2.

### Os blocos registram o que têm pendente, em vez de o pai segurar o estado

Para um "Salvar" só gravar seis blocos sem subir o estado dos seis para o
cabeçalho, cada bloco **entrega** ao fluxo o que tem para gravar
(`pendencias.tsx`). O registro mora dentro do `useSecao`, então as quatro
seções de linhas entraram sem uma alteração; o resumo e cada linha de bloqueio
chamam na mão.

O contexto vive num arquivo que **não importa nada do relatório**: pelo caminho
de dentro das seções, um ciclo de imports deixaria o contexto indefinido na
montagem.

### Seção inteira numa chamada, não linha a linha

As seções de linhas (entregas, métricas, OKRs, pauta) editam em memória e
gravam a seção toda numa transação (`salvarSecao`). Vinte linhas em vinte
chamadas deixariam a tela num estado que não existe no banco se a décima
falhasse. **Os bloqueios são a exceção** — ali cada linha nasce, salva e morre
por conta própria (e desde `357852f` também é gravada pelo "Próximo").

### O responsável do cartão é gente da plataforma, não texto

Virou relação com `User` em `4eab79f`, porque foto de perfil não existe para
texto digitado à mão. O seletor mostra **quem está lotado no subsetor**, e a
action **confere isso de novo no servidor**: o id vem do navegador, e sem a
conferência um cartão do Marketing poderia cair no nome de alguém da Logística.
`SetNull` no desligamento — sair da empresa não leva o cartão junto.

### A média de 4 semanas casa os KRs pelo TEXTO

Cada relatório tem as suas próprias linhas de OKR (é o que preserva a
história). A média atravessa os relatórios casando pelo **texto** do
resultado-chave, não por id. **Consequência, de propósito: renomear um KR
reinicia a média dele.** Um KR renomeado mede outra coisa.

---

## 4. Verificado

### Automático

| | |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint` | limpo |
| `npm run build` | limpo |
| `npm test` | **503/503** (19 em `math.test.ts`, cada um citando a célula de origem) |
| `npm run test:db` | **188/188** (13 do relatório: escopo, isolamento entre áreas, contadores, média de 4 semanas, unicidade do código por subsetor) |

### No navegador, com uma semana inteira preenchida

Semana 52 criada do zero pelo fluxo em etapas e preenchida campo por campo:

| Bloco | Conferido |
|---|---|
| Resumo | destaque, aprendizado e prioridade, os três na leitura |
| Entregas | 2 linhas com dia, bloco, entrega, sinal, link de evidência e observação |
| Métricas | 2 linhas com **+100,0%** e **−17,5%** calculados sozinhos |
| OKRs | KR de leitura mensal com **30,0% da meta** e média de 4 semanas |
| Bloqueios | linha completa com prazo — **gravada só pelo "Próximo"** |
| Pauta | as 5 perguntas respondidas |

Depois do F5, a leitura abriu com as seis abas e tudo no lugar: `Resumo ·
Entregas (2) · Métricas (2) · OKRs (1) · Bloqueios (1) · Pauta (5)`.

Também conferidos: semana repetida recusada ("Já existe um relatório para esta
semana"), data inválida recusada, semana vazia dizendo que está vazia, bloco
único sem abas, pauta com 1 de 5 respondidas mostrando 1, o lápis e o botão
Editar caindo no editor, o "Salvar" do cabeçalho gravando bloco que não passou
pelo botão da seção, o Kanban recusando Publicado sem evidência pelo teclado, e
o avatar aparecendo no cartão depois de salvar.

**Como foi testado:** usuário Gestor temporário criado direto no banco de dev,
logado pelo fluxo real, **apagado ao fim** junto com as semanas de teste.

---

## 5. Limites conhecidos

- **Nada tranca a semana depois da reunião.** §0.2.
- **Não há salvamento automático.** "Próximo" e "Salvar" gravam; fechar a
  página com um bloco sujo sem clicar em nenhum dos dois perde o que foi
  digitado nele.
- **Bloqueio sem título não é gravado por "Próximo"** — o servidor recusa
  bloqueio sem título, então a linha só se registra quando já dá para salvá-la.
- **Renomear um KR reinicia a média de 4 semanas.** De propósito. §3.
- **O código do cartão (`K-13`) sai do maior existente**, não da contagem.
  Excluir o `K-12` e criar outro dá `K-13` — o código é como a tarefa é citada
  na reunião, e reaproveitá-lo confundiria a ata.
- **Um relatório por semana em cada área**, garantido por `@@unique`.
- **A ferramenta não exporta.** A planilha era um arquivo que se mandava por
  e-mail; isto é uma tela. Se a entrega precisar sair do sistema, é trabalho
  novo — e `src/lib/pdf/` já existe no projeto.
- **Não conferidos:** tema escuro, janela estreita, duas abas na mesma semana e
  queda de rede no meio do salvamento. Celular está fora do escopo (§0.5).

---

## 6. Arquivos

```
prisma/
  migrations/20261123040447_relatorio_semanal_marketing/
  migrations/20261123140323_tarefa_responsavel_vira_usuario/
  schema.prisma                      6 modelos + 5 enums + weeklyReportEnabled

src/types/weekly-report.ts           o domínio do lado da tela

src/lib/weekly-report/
  templates.ts                       a pauta do one-on-one (o que ainda nasce pronto)
  math.ts                            as fórmulas + semana ISO
  math.test.ts                       19 testes
  data.ts                            leitura, com os números calculados
  data.dbtest.ts                     13 testes contra o Postgres
  guards.ts                          papel + escopo, SEM "use server"
  actions.ts                         10 actions
  labels.ts                          rótulos e formatação

src/components/weekly-report/        18 arquivos, dos quais valem o nome:
  weekly-report-panel.tsx              a aba: lista, Kanban, leitura e edição
  report-card.tsx                      o card da semana
  report-view-modal.tsx                a leitura (só o que foi preenchido)
  new-report-modal.tsx                 a semana nova, em etapas
  report-editor.tsx                    a edição
  report-steps.tsx                     os seis passos, usados pelos dois
  pendencias.tsx                       o registro do que cada bloco tem a gravar
  kanban-board.tsx                     o quadro

scripts/setup-relatorio-semanal.ts   habilita + semeia o quadro
```

O `guards.ts` é um módulo **sem** `"use server"` de propósito — exportá-lo de
`actions.ts` transformaria as guardas em endpoints chamáveis pelo navegador. É
a mesma decisão de `sales-funnel/guards.ts` e `cronograma-guards.ts`.

---

## 7. Nota sobre dado de desenvolvimento

Em cada rodada de conferência foram criados e depois **apagados**: um usuário
Gestor temporário (`qatela#BC`) e as semanas de teste que ele criou. O banco de
dev terminou com as três semanas do Administrador (45, 1 e 2) intactas e o
quadro do Marketing com os 12 cartões originais. Nenhum outro dado foi tocado.
