# Meu Setor ganha relatório em PDF, o Cronograma ganha line-up, e Minhas Avaliações vira quadro

10 e 11 de novembro de 2026

**Nada aqui foi commitado.** Está tudo na árvore de trabalho, junto com o módulo da
Página de Integração de 28/10 e 03/11, que continua intocado. As **duas migrations já
foram aplicadas** no banco de desenvolvimento (`buildconnect_dev`), por
`prisma migrate deploy` — sem reset, sem drift.

Nenhum dev server ficou de pé.

**Verificação ao fim:** `tsc --noEmit` exit 0 · **475/475** testes · `eslint .` limpo ·
`npx next build` limpo · e tudo clicado no navegador, com dados reais, logado como Admin
e como Gestor.

> **O Build.Flow não foi tocado.** A árvore dele está limpa (0 arquivos). A única
> interação foi de LEITURA: o gerador de PDF foi copiado de lá para cá.

---

## 0. ⚠️ O que você precisa decidir antes de commitar

### 0.1 `prisma/schema.prisma` mistura o seu trabalho com o meu

É o **único** arquivo compartilhado. Ele tem as suas ~202 linhas não commitadas da Página
de Integração **mais** as minhas 5 (o valor `LANCAMENTO` no enum e a coluna
`ContentPost.lineUp`).

Commitar o arquivo leva as duas coisas junto. Separar exige `git add -p`, que é
interativo. Os meus outros 30 caminhos estavam todos limpos antes, então esses você
commita normalmente.

### 0.2 O que é meu e o que já era seu

| | Quantidade | Como identificar |
|---|---|---|
| Meu | **31 caminhos** | modificados em 10/11 |
| Seu (Integração, WhatsApp, storage) | **41 caminhos** | modificados antes disso |

Lista do que é meu:

```
prisma/migrations/20261110120000_content_format_lancamento/
prisma/migrations/20261110120100_content_line_up/
prisma/schema.prisma                              ← MISTURADO, ver §0.1
src/app/api/meu-setor/                            ← novo
src/app/meu-setor/page.tsx
src/app/setores/motoristas/page.tsx
src/app/setores/ti/page.tsx
src/components/cronograma/content-calendar.tsx
src/components/cronograma/post-details-modal.tsx
src/components/cronograma/post-modal.tsx
src/components/it/driver-sector-view.tsx
src/components/it/it-sector-view.tsx
src/components/me/answered-evaluations-panel.tsx
src/components/me/evaluation-task-meta.ts         ← novo
src/components/me/evaluation-task-meta.test.ts    ← novo
src/components/me/my-evaluations-kanban.tsx       ← novo
src/components/me/my-evaluations-panel.tsx
src/components/sector-overview/member-card.tsx
src/components/sector-overview/members-grid.tsx
src/components/sector-overview/sector-overview-view.tsx
src/lib/cronograma-actions.ts
src/lib/cronograma-data.ts
src/lib/funnel.ts
src/lib/funnel.test.ts                            ← novo
src/lib/pdf/                                      ← novo, portado do Flow
src/lib/sector-evaluations-data.ts
src/lib/sector-overview.ts
src/lib/sector-overview-data.ts
src/lib/sector-report-pdf.ts                      ← novo
src/lib/sector-report-pdf.test.ts                 ← novo
src/types/cronograma.ts
```

---

## 1. O que foi feito

Seis pedidos, em dois lotes.

### 1.1 Relatório de progresso individual em PDF — "Meu Setor"

Botão **"Exportar PDF"** na linha das abas, em
[sector-overview-view.tsx](src/components/sector-overview/sector-overview-view.tsx).

- [sector-report-pdf.ts](src/lib/sector-report-pdf.ts) — monta o documento.
- [src/app/api/meu-setor/relatorio/route.ts](src/app/api/meu-setor/relatorio/route.ts) —
  Route Handler, não Server Action, porque a resposta é um **arquivo binário**: o
  navegador baixa direto, sem o PDF trafegar em base64 no payload do React.
- [src/lib/pdf/](src/lib/pdf/) — o gerador, **portado do Build.Flow**. Zero dependência
  nova.

O relatório traz os sete itens pedidos: cadastro, progresso de consumo, média de vídeo,
reprovações, total de pendências, histórico de avaliações (quantidade **e**
detalhamento) e as pastas do Departamento Pessoal.

**O escopo é decidido na rota**, repetindo a regra da página de propósito: o Gestor é
preso ao próprio setor e o `?setor=` é **ignorado** para ele. Sem essa linha, bastava
digitar a URL para levar o progresso — e a documentação pessoal — da equipe de outro
setor num arquivo. Esconder o botão na tela não é a proteção; isso é.

Os campos de cadastro (usuário, telefone) **não** entraram em `MemberOverview`: eles não
aparecem em tela nenhuma, e colocá-los no tipo os despacharia no payload da página para
todo mundo que a abre. A rota busca o que a rota precisa.

### 1.2 Aprimoramento visual do relatório

O relatório textual virou documento com hierarquia: **cartões de indicador**, **barras de
progresso**, **dois gráficos de barras** e **tabelas com cabeçalho e listras**.

Para isso o gerador portado ganhou as primitivas que faltavam — **curvas de Bézier**,
retângulo com raio por canto, círculo, polígono e traçado. Os ícones (visto, alerta,
documento, ponto) são vetores desenhados no próprio módulo: embutir uma fonte de ícone
pesaria mais que o relatório inteiro.

**Duas decisões que valem saber:**

**Não há rosca nem pizza, e foi de propósito.** O progresso do setor é concluído ×
restante — duas fatias. Pizza de duas fatias é um número disfarçado de gráfico: virou
cartão de destaque com barra de progresso. O que de fato compara grandeza — o avanço e a
média de **cada** colaborador — virou barra, que é a forma em que a diferença entre
pessoas se lê. Se a rosca for requisito inegociável, dá para acrescentar; a primitiva de
arco já existe.

**As cores foram validadas, não escolhidas a olho.** A primeira escolha foi **reprovada**:
o laranja que seria o segundo slot natural fica a **ΔE 11,4** do âmbar de alerta — abaixo
do piso de 15 — e os dois dividem a mesma página. O trio final (azul `#2a78d6`, aqua
`#1baf7a`, âmbar `#b0680a`) passa junto em separação para daltonismo e em contraste sobre
papel. E **nenhum estado depende da cor**: toda situação vem com a palavra junto, porque
relatório costuma sair impresso em preto e branco.

### 1.3 Line-up no Cronograma

O formato **"Lançamento"** entrou no vocabulário, e com ele o campo **"N° do Line-Up"**,
que só aparece quando o formato está marcado.

O padrão já existia idêntico: o formato `OUTRO` abre o campo condicional `formatOther`,
validado no zod por `formats.includes("OUTRO") && !formatOther`. `LANCAMENTO` + `lineUp`
é a mesma forma, copiada.

O campo **filtra dígitos na digitação**, e não usa `type="number"`: o campo numérico do
navegador aceita `e`, sinal e separador decimal, e oferece setas de incremento para algo
que é identificador, não quantidade.

O número sai em **bloco destacado** no card do calendário e no modal de detalhes.

> Sem automação. O título do pedido falava em "automação de início de processos de
> lançamento", mas as especificações só descreviam o campo e o card — e foi isso que
> entrou, por decisão sua.

### 1.4 Quadro de avaliações com quatro colunas — "Minhas Avaliações"

Alternador **Lista | Quadro** (o `Segmented` da casa, `role="radiogroup"` — lista e quadro
não são conteúdos irmãos, são o mesmo conteúdo de dois jeitos).

O quadro tem **quatro colunas fixas**:

```
360° Pendentes · 360° Concluídas · Vídeo Pendentes · Vídeo Concluídas
```

Quatro em tela larga, duas no meio-termo, uma no celular — e nessa ordem o par
pendente/concluída de cada assunto fica sempre junto.

**O formulário do DHO entra nas colunas 360°**, por decisão sua. Ele não é 360° nem vídeo;
tirá-lo do quadro o tornaria uma pendência invisível para quem usa só o quadro. O selo do
card continua dizendo "Formulário".

A régua que decide a coluna (`ehAvaliacaoDeVideo`) mora em
[evaluation-task-meta.ts](src/components/me/evaluation-task-meta.ts), com teste que
verifica que **os quatro tipos são cobertos sem sobra** — um quinto tipo quebra o teste
em vez de sumir do quadro.

Esse módulo também concentra os rótulos derivados (título, detalhe, tom, botão) que a
**lista e o quadro** compartilham: com a regra duplicada, bastaria um ajuste de texto numa
delas para a mesma tarefa aparecer com nomes diferentes.

### 1.5 Pendências no card do colaborador — "Meu Setor"

O botão "Avaliações" e o modal já existiam, com o histórico de concluídas. Entrou a seção
**Pendentes**: os instrumentos que **nunca foram aplicados** àquela pessoa.

Derivados da consulta de avaliações que `getSectorOverview` **já fazia**, ampliando um
`select` que já lia a tabela de tipos. **Zero consulta nova.**

O atalho leva o avaliador **para onde ele pode agir**: aba Avaliações de um subsetor que
*quem olha* alcança. Instrumento multiavaliador sai **sem atalho**, dizendo que a rodada é
aberta pelo DHO — um link ali levaria a uma tela sem a avaliação, e a pessoa concluiria
que está quebrado.

A contagem do botão passou a incluir as pendências. Sem isso ele desabilitaria (contagem
zero) justamente em quem nunca foi avaliado por ninguém — a pessoa de quem o gestor mais
precisa saber. O cabeçalho do modal abre a conta: "N registros · M pendentes".

---

## 2. Os bugs que o navegador achou

**Nenhum dos seis falhava em `tsc`, teste ou lint.** É a classe que o §6.2 do handoff do
Flow aponta: sem um portão que monte componente e leia o console, ela é invisível no CI.

### 2.1 O filtro de dígitos do line-up não filtrava nada

Digitar `ab1c2d3-e.4` aceitava `ab1c2d`. O arquivo tinha `replace(/D/g, "")` em vez de
`/\D/g` — a barra invertida foi comida pelo script que aplicou o patch. O regex removia a
letra "D" literal.

### 2.2 O bloco do line-up não aparecia no calendário

[content-calendar.tsx](src/components/cronograma/content-calendar.tsx) tem **dois**
renderizadores de card: `PostChip` (o chip da célula do mês, que é o que se vê) e
`ExpandedPostCard`. Só o segundo tinha sido editado.

### 2.3 O atalho "Avaliar" abria na aba errada — o pior dos seis

O link **abria**, só abria no lugar errado. Caía em `/setores/ti?aba=avaliacoes` e parava
em "Chamados".

| Rota | Lê `?aba=` |
|---|---|
| `/setores/[slug]` (genérica) | **sim** — passa `initialTab={query?.aba}` |
| `/setores/ti`, `/setores/motoristas` | **não** — páginas dedicadas, montam a própria barra |

A primeira correção foi excluir esses slugs da escolha — e o atalho **sumiu** em
Retaguarda, porque `ti` era o único subsetor elegível. Um link errado virou link nenhum.

A correção final foi fazer as duas views dedicadas aceitarem `initialTab`. Isso **apagou**
a lista de exceções que eu tinha criado e ainda corrigiu um detalhe que já faltava lá: F5
nessas páginas não devolvia a pessoa para a aba em que estava.

### 2.4 A rota do relatório divergia da página

A página manda o Admin sem `?setor=` para o primeiro setor; a rota devolvia 400. A mesma
URL não pode abrir a tela e recusar o relatório dela.

### 2.5 Colaborador com 0% ganhava uma lasca de barra

Um `Math.max(1.5, …)` forçava largura mínima. A lasca lê como "já começou" — exatamente o
contrário do dado. Zero agora não desenha nada; o rótulo informa o zero.

### 2.6 Tabela que virava a página perdia o cabeçalho

A linha aparecia órfã no topo da folha seguinte, sem as colunas. O cabeçalho agora é
redesenhado sempre que a tabela pagina.

---

## 3. Como foi verificado

### 3.1 Automático

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 |
| `npm test` | **475/475** |
| `eslint .` | limpo |
| `npx next build` | limpo; `/api/meu-setor/relatorio` registrada |

Testes novos: `funnel.test.ts` (o vocabulário de formatos — guarda a sincronia entre o
enum e `FORMAT_ORDER`, que um array esquecido faria sumir da tela sem erro de tipo),
`evaluation-task-meta.test.ts` (rótulos + a régua das quatro colunas) e
`sector-report-pdf.test.ts` (o documento abre, pagina, e **"fora do alcance" sai diferente
de "vazio"** — o único caso com consequência de privacidade).

### 3.2 No navegador, com dados reais

Como **Admin**:

- Line-up: campo condicional · filtro de dígitos · validação ("Informe o nº do line-up.")
  · bloco no card e no modal · selo no backlog · **regressão**: desmarcar o formato limpa o
  line-up no banco
- Quadro de 4 colunas: estrutura, contagens, estados vazios, e um card real caindo em
  **360° Pendentes** com as de vídeo em 0
- Ciclo completo: rodada atribuída → card em Pendentes → 30 critérios respondidos → card
  migra para **Concluídas (240 pts)** → a pendência **some** do card do colaborador e
  entra em DESEMPENHO
- Relatório: renderizado e **lido** na tela, com cadastro, gráficos, tabelas e o
  Departamento Pessoal completo

Como **Gestor** (usuário de teste criado e removido depois):

| Ataque | Resultado |
|---|---|
| `/meu-setor?setor=<outro setor>` | abriu o **próprio** setor |
| `/api/meu-setor/relatorio?setor=<outro setor>` | 200, e o PDF **não contém** nada do outro setor |
| Sem permissão de documentos | "Documentação fora do seu alcance — não incluída neste relatório" |

Sem sessão, `/api/meu-setor/relatorio` responde **307 → /login** (o middleware intercepta
antes da rota), inclusive com `?setor=` forjado.

**Console sem nenhum aviso do React** em todas as telas novas.

### 3.3 Artefatos de teste

Criados e **removidos**, com o alvo conferido antes: um post `[teste Claude]` no
cronograma, duas rodadas de Matriz de Decisão e um usuário gestor (`testeclaude#BC`).
`git status` não tem resíduo.

---

## 4. Pendente, não testado e limites conhecidos

### 4.1 Não verificado

- **Cards nas colunas de vídeo do quadro.** Exigiria um colaborador responder a pergunta
  de compreensão de uma Instrução em Vídeo, e não há vídeo publicado. A divisão está
  coberta por teste unitário.
- **Relatório com barras cheias.** Neste banco todo mundo está em 0% de consumo, então os
  gráficos saem honestamente vazios. A versão com dados variados foi conferida numa
  amostra gerada à parte.
- **Os `*.dbtest.ts`** não rodaram.

### 4.2 Limites conhecidos

- **A pendência é por INSTRUMENTO.** Um Pré-Efetivo com o ciclo 1 respondido e os ciclos 2
  e 3 em aberto conta como "feita". É o que foi pedido ("as que ainda não foram feitas a
  ele"), mas vale saber.
- **Rodada atribuída e não respondida continua "Nunca aplicada".** Coerente — a pendência
  só sai quando a avaliação existe —, mas o card não distingue "ninguém foi designado" de
  "designaram e ainda não responderam".
- **O card de concluída no quadro não abre o detalhe.** O "Ver respostas" da lista ocupa o
  painel inteiro e não cabe numa coluna. Está marcado com `shortcut:` no código.
- **`src/lib/pdf/` é uma CÓPIA do Flow, e agora divergiu mais.** Ganhou aqui as primitivas
  vetoriais que lá não existem. Correção de um lado não chega ao outro. Está escrito no
  cabeçalho do arquivo.

---

## 5. O que eu sugiro

### 5.1 Um portão que monte componente e leia o console

**Seis bugs desta sessão passaram por `tsc`, 475 testes e lint.** Todos foram achados
abrindo a tela. Não é azar: nenhum script monta componente, então render, hidratação e
atributo errado no DOM não têm como falhar no CI.

O mínimo que fecha a classe: um script que sobe a aplicação, abre meia dúzia de rotas
autenticadas e **falha se o console tiver erro ou aviso do React**. Não é teste de UI — é
o alarme de fumaça.

### 5.2 Decidir o que fazer com a cópia do gerador de PDF

Hoje há dois geradores quase iguais, em repositórios diferentes, já divergentes. As saídas
são: aceitar a cópia conscientemente (e anotar), ou extrair para um pacote compartilhado.
A primeira é legítima; só não deve ser por inércia.

### 5.3 Fechar o ciclo do Pré-Efetivo na lista de pendentes

Se a granularidade por ciclo importar, os dados já estão modelados (`EvaluationCycle` com
status por ciclo). É uma consulta a mais e um rótulo por ciclo.
