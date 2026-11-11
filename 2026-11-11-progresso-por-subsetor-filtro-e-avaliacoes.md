# Progresso por subsetor, filtro no Meu Setor, e o módulo de Avaliações

11 de novembro de 2026

**Tudo commitado e empurrado.** `main` em `1070bb3`, árvore de trabalho limpa
(0 caminhos sujos), `main` e `origin/main` no mesmo ponto. Foi a primeira vez
em semanas que nada ficou fora da máquina do tempo — a sessão começou com
**74 caminhos não commitados** e terminou com zero.

**Verificação ao fim:** `tsc --noEmit` exit 0 · `eslint .` limpo · **484/484**
testes · **175/175** testes de banco · `npx next build` limpo · as **59
migrations** aplicadas num banco vazio e conferidas contra o schema · tudo
clicado no navegador, logado, com console sem um aviso.

---

## 0. ⏳ PENDÊNCIA PARA DECIDIR

### 0.1 O recorte do Gestor no módulo de Avaliações é por SETOR, não por subsetor

**Status: aguardando decisão. Nada foi feito.**

A especificação de 11/11 dizia:

> *"O gestor deve ter acesso visual exclusivo às avaliações pendentes
> pertencentes estritamente ao seu respectivo **setor ou subsetor**."*

Hoje o recorte existe e funciona, mas é por **setor**. Em
`src/lib/sector-evaluations-data.ts`:

```ts
// Admin: sem filtro de setor. Gestor: escopo no setor da página.
const scope = isAdmin ? null : [sectorLabel];
```

E a quinta fonte de pendências que entrou em `1070bb3`
(`src/lib/evaluation-rounds.ts`) repete a mesma régua: filtra por
`subject.sectorId`.

**O que isso significa na prática:** o Gestor de **Vendas** enxerga as
avaliações pendentes de **Marketing**, porque os dois são do setor Comercial.

**A decisão é sua:** isso é problema ou é o comportamento desejado? Há
argumento para os dois lados — um Gestor de setor pode legitimamente
responder pela equipe inteira do setor, e nesse caso está certo como está.

**Se decidir mudar, a base já existe.** A régua de subsetor foi construída
hoje e está em `src/lib/progress-scope.ts`:

```ts
trackedSubsectorIdsOf(marcadosNoCadastro, subsetoresDoSetor)
```

Seria aplicá-la nos dois pontos acima, trocando o filtro por `sectorId` pelo
conjunto de subsetores do Gestor.

**Um efeito colateral que precisa entrar na conta:** quem **não tem marcação**
de subsetor no cadastro responde pelo setor inteiro. Hoje isso é quase todo
mundo no banco. Então, enquanto o cadastro não for preenchido, o recorte por
subsetor **não mudaria quase nada** — e, pior, quem não tiver marcação
continuaria vendo tudo, o que pode parecer que a mudança não funcionou.

**Ordem recomendada, se for mudar:** primeiro preencher as marcações de
subsetor no cadastro dos gestores, depois trocar a régua.

---

## 1. O que foi feito — sete commits

### `af342bd` — Progresso passa a ser do subsetor da pessoa, e Minhas Avaliações vira quadro

**O bug que isso consertou, e que ninguém tinha notado:** o denominador do
progresso era o SETOR inteiro em duas telas e o SUBSETOR em outras duas. A
mesma pessoa aparecia com percentuais diferentes dependendo de onde você
olhava — "Meu Progresso" dizia uma coisa e "Meu Setor" dizia outra.

A régua agora mora num lugar só, pura e testada
(`progress-scope.trackedSubsectorIdsOf`):

```
marcou subsetor no cadastro  →  deve aquele subsetor
não marcou                   →  deve o setor inteiro
sem lotação                  →  não deve nada
```

Quem está em Produção > Almoxarifado parou de dever costura, corte e PCP.

Outras entregas do mesmo commit:

- **Botão "Avaliações" tricolor** no card do colaborador: vermelho sem nenhuma
  aplicada, âmbar com pendência, verde com o catálogo em dia — sempre com a
  **palavra** junto da cor, porque o painel sai impresso em preto e branco e
  cerca de 1 em 12 homens não distingue vermelho de verde.
- **Minhas Avaliações** deixou de alternar lista/quadro e passou a alternar
  **escopo** (Internas/Onboarding e Vídeos), sempre em quadro, duas colunas
  largas, três cards à vista e rolagem depois.
- O **"Ver respostas"**, que só existia na lista, migrou para o card — senão
  a capacidade morreria junto com a lista.
- Uma faixa avisa quando há pendência no **outro** escopo. Sem ela, quem abre
  a tela (que começa em "Internas") nunca saberia de uma pendência de vídeo.
- Em Meu Setor, a **busca passou a dividir o canto com o Exportar PDF**.

### `37dfd0b` — stream-file, que a rota da vitrine importa desde 451c2ec

**Reparo.** O commit anterior (`451c2ec`) publicou
`api/integracao/flow/vitrine/arquivo/route.ts`, que importa
`@/lib/storage/stream-file` — e o arquivo ficou para trás na árvore de
trabalho. Na máquina de quem escreveu ele existe; **num clone limpo, não**, e
o `tsc` parava ali antes de qualquer outra coisa.

Foi para um commit sozinho, de propósito: enterrado no meio de 29 arquivos
sobre outro assunto, ninguém mais acharia.

### `bb2e2eb` — Meu Setor ganha relatório em PDF, e o Cronograma ganha o line-up

Trabalho da sessão de 10-11/11 que estava não commitado.

- **Relatório em PDF** por Route Handler, não Server Action, porque a
  resposta é arquivo binário. O escopo é decidido **na rota**: o Gestor é
  preso ao próprio setor e o `?setor=` é ignorado para ele. Esconder o botão
  não é a proteção; essa linha é.
- O gerador (`lib/pdf`) foi **portado do Build.Flow** em vez de entrar
  dependência nova, e ganhou aqui primitivas vetoriais que lá não existem —
  logo, é uma **cópia que já divergiu**, e isso está no cabeçalho do arquivo.
- **Line-up no Cronograma**: formato "Lançamento" e, condicional a ele, o nº
  do line-up. O campo filtra dígitos e **não** é `type="number"` — o campo
  numérico aceita `e`, sinal e decimal, e oferece setas de incremento para
  algo que é identificador, não quantidade.
- As páginas dedicadas de **TI e Motoristas** passaram a ler `?aba=`, o que
  conserta o atalho das avaliações pendentes e, de brinde, faz o F5 devolver
  a pessoa à aba em que estava.

**Este commit carrega mais do que o assunto dele, e há motivo:**
`prisma/schema.prisma` é o único arquivo compartilhado com a Página de
Integração, o line-up precisa dele, e não há como levar meio arquivo. Com o
schema vieram as **seis migrations** (senão schema e banco divergem no
primeiro `prisma migrate` de um clone limpo) e, com a migration do convite,
`WhatsappMessage.userId` virou anulável — o que obrigou o **código de
WhatsApp** a vir junto ou nada compilava.

### `005d78a` — Teto de vídeo sobe de 1 GB para 4 GB, e o que sustenta isso é TEMPO

A restrição nunca foi tamanho de corpo: é o `requestTimeout` do Node, que
vale 300 s por padrão e que o `next start` não deixa configurar. Passado
disso o socket é destruído, o proxy responde 502 e o log fica com um
`ECONNRESET` mudo.

Três números que andam juntos, amarrados por teste: `limits.ts` (4 GB),
`next.config.mjs` (4112 MB) e `http-request-timeout.cjs` (5 h). A 4,8 Mbps
medidos em produção, 4 GB levam ~119 min; 5 h dá folga de 2,5x.

### `850e031` — Página de Integração: o convidado entra sem conta

Módulo isolado para quem ainda não é funcionário. O portão **não** é a sessão
do sistema: é link de convite não revogado mais o cookie `bc_convidado`. Por
isso `/integracao` entra em `PUBLIC_PATHS` sem afrouxar nada do resto.

Quem tem sessão e abre o convite não é mais mandado para a home — o DHO caía
no sistema ao conferir o link que acabou de copiar.

### `793725e` — Meu Setor filtra por subsetor, e o relatório sai com o mesmo recorte

**Isto reverte uma decisão de 22/09**, e vale saber por que foi seguro.

A pílula de subsetor foi removida naquela data porque trocava o
**denominador** junto: a mesma pessoa exibia um percentual em cada pílula.
Ela voltou porque essa causa deixou de existir — desde `af342bd` o
denominador é dos subsetores **de cada pessoa**, então filtrar escolhe quem
entra na lista e não mexe no número de ninguém.

**Há teste de banco cuidando de que continue assim:** ele compara
`totalItems`, `doneItems` e `progress` com e sem filtro. Se alguém voltar a
derivar o denominador do recorte aberto, o teste cai.

- Quem entra no recorte é quem **responde** por ele — a mesma régua do
  denominador. Quem não marcou subsetor nenhum aparece em qualquer filtro do
  setor: escondê-lo faria pessoas sumirem do painel sem ninguém as excluir.
- O **Gestor passou a ter pílulas** também — dos subsetores do setor dele.
- `?subsetor=` forjado é **ignorado**, não recusado, na página e na rota. Dar
  404 criaria uma resposta diferente de "200 com o setor inteiro", e alguém
  poderia chutar ids para descobrir o que existe em outros setores.
- O **Exportar PDF acompanha o recorte** (está na URL), e continua **não**
  acompanhando a busca por nome (estado do cliente): um relatório que mudasse
  com o que se digitou no campo seria impossível de pedir duas vezes igual.

### `1070bb3` — Pré-Efetivo entra em Minhas Avaliações, e o Admin vê quem avaliou quem

- O ciclo de Pré-Efetivo **disponível** vivia só na aba do setor. Agora
  aparece também na fila de "Minhas Avaliações", com o mesmo recorte: Admin
  todos os setores, Gestor o setor de lotação dele, demais nenhum.
- O tipo novo chama-se `PRE_EFETIVO` **nos dois lados**, pendente e
  concluída. Isso mantém as duas uniões idênticas (agora por referência) e
  corrige um rótulo errado: um Pré-Efetivo concluído chegava marcado como
  **"Feedback"**, que é outro instrumento.
- O **quadro do Admin** passa a trazer o que outras pessoas preencheram, com
  cinco campos **rotulados**: avaliado, avaliador, instrumento, desde quando
  estava disponível e quando foi concluída. O avaliador só aparece quando
  **não** é quem está lendo, então o quadro do Gestor fica idêntico ao de
  antes.
- A frase do rodapé mudou junto: deixar *"ninguém mais alcança este quadro"*
  enquanto o Admin vê tudo seria a interface afirmando o contrário do que faz.
- **Rascunho de terceiro fica de fora**: é trabalho em andamento, não
  registro.

---

## 2. Três defeitos achados por acaso, e consertados

### 2.1 O teste que fingia proteger

Existia um teste chamado *"as quatro colunas cobrem todos os tipos, sem
sobra"*, com o comentário: *"é o que impede uma pendência de sumir do quadro
quando um tipo novo for criado."*

**Criei um tipo novo. O teste passou.** A lista era um array literal:

```ts
const todos = ["FEEDBACK", "AUTOAVALIACAO", "FORMULARIO", "COMPREENSAO_VIDEO"];
```

Nascia um tipo, o array continuava com os quatro antigos, e o teste conferia
a cobertura da própria lista desatualizada — **ele verificava a si mesmo**. Era
o acidente que dizia impedir, com a camada extra de perigo de todo mundo se
achar protegido.

Agora a lista vem de um `Record` da união: quem acrescentar um tipo **não
compila** até decidir de que lado ele cai.

### 2.2 Chave de card que colidiria

A função que gera a chave de cada card do quadro fazia
`${kind}-${formId ?? comprehensionId ?? roundId}`. O Pré-Efetivo não tem
rodada, então **dois ciclos disponíveis do mesmo colaborador cairiam na mesma
chave** e o React reaproveitaria o card errado ao reordenar a fila. Corrigido
(chave = colaborador + ciclo) e com teste.

### 2.3 A `main` não compilava num clone limpo

Ver `37dfd0b` acima. O `stream-file.ts` faltava desde o commit anterior.

---

## 3. Como foi verificado

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint .` | limpo |
| `npm test` | **484/484** |
| `npm run test:db` | **175/175** |
| `npx next build` | limpo, 30 rotas |
| Migrations do zero | **59 aplicadas num banco vazio**, e `migrate diff` contra o schema: *No difference detected* |
| Navegador, logado | todas as telas tocadas, **console sem um aviso** |

**O teste de migrations do zero foi inventado nesta sessão** e vale manter no
ritual de pré-deploy. O `prisma migrate status` compara com o banco de
desenvolvimento, que foi construído aos poucos; o deploy pega um banco vazio
e roda as 59 de uma vez. Uma migration pode depender de algo que outra apagou
— no banco que cresceu dá certo, no banco novo quebra, **em produção, com o
banco pela metade**.

Testes novos desta sessão: `progress-scope.test.ts` (6 asserções da régua de
subsetor), a cobertura tricolor em `sector-overview.test.ts`, três casos de
filtro por subsetor em `sector-overview-scope.dbtest.ts`, a marcação de
subsetor em `employee-history-scope.dbtest.ts`, e o Pré-Efetivo em
`evaluation-task-meta.test.ts`.

---

## 4. Limites conhecidos

- **Paginação morreu** quando a visualização em Lista saiu de "Minhas
  Avaliações". As colunas do quadro rolam. Com poucos registros não se nota;
  com centenas de concluídas, a coluna carrega todas de uma vez. Se virar
  realidade, o conserto é paginar a coluna.
- **Quem não tem marcação de subsetor aparece em todos os filtros** do setor
  dele. É o cadastro dizendo que a pessoa responde pelo setor inteiro, não um
  bug — mas, até o cadastro ser preenchido, os filtros parecem pouco
  seletivos.
- **O Admin, em "Meu Progresso", continua vendo o acervo da empresa inteira.**
  É a única tela onde a régua de subsetor não se aplica, e é decisão de
  produto documentada em dois lugares. Trocar é apagar duas linhas.
- **`src/lib/pdf/` é uma cópia do Build.Flow e já divergiu.** Correção de um
  lado não chega ao outro.
- **O card de concluída não abre detalhe na compreensão de vídeo** — a nota e
  o comentário já estão no próprio card.

## 5. Não verificado

- **Nenhuma tela foi aberta como Gestor.** Sem a senha, o recorte dele foi
  coberto pelo lado do servidor (consultas filtram por `sectorId`, e o
  `?subsetor=` forjado foi exercitado e rejeitado).
- **Largura de celular** não foi testada no quadro nem nas pílulas; as
  classes responsivas foram conferidas no DOM, o que é decisivo mas não é ver.
- **Envio de vídeo de 4 GB** não foi testado de verdade (exige o arquivo e
  ~2 h). O que está garantido é que os três números batem entre si.
- **O formulário de Pré-Efetivo foi aberto, não enviado** — para não gravar
  avaliação real sobre uma pessoa.

## 6. Risco de operação — o único que o código não pega

**O proxy reverso na frente do container precisa acompanhar o teto de 4 GB:
tamanho máximo de corpo E timeout de leitura.** Se ficar abaixo, o envio
morre lá fora e nada no log da aplicação avisa. A 4,8 Mbps, 4 GB levam ~119
minutos; um Nginx com os 60 s de fábrica derruba todo envio grande, e vai
parecer bug da aplicação.

## 7. Nota sobre dado de desenvolvimento

Durante os testes, a limpeza de um fixture apagou **todos os ciclos de
avaliação do colaborador "Teste"** (3 linhas), e só 2 tinham sido criadas
nesta sessão. Se ele tinha agenda de Pré-Efetivo marcada antes de 11/11, ela
precisa ser remarcada pelo DHO. Nenhum outro usuário foi afetado.
