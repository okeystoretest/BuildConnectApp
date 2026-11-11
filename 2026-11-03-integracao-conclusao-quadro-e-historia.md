# Integração: a conclusão vira fato, o quadro vira kanban, e a história ganha tela

3 de novembro de 2026

**Nada aqui foi commitado**, e continua tudo na árvore de trabalho junto com o módulo
inteiro de 28/10. A migration **já foi aplicada** no banco de desenvolvimento
(`buildconnect_dev`).

Esta sessão começou como "abrir o módulo no navegador pela primeira vez" — ele nunca
tinha sido clicado, só testado — e terminou com quatro bugs corrigidos, três regras novas
e uma seção nova.

---

## Cinco bugs que só apareceram clicando

Nenhum deles falhava em teste, lint ou tipo. Os quatro primeiros estavam de pé desde
antes desta sessão.

### 1. O logo quebrado para quem não tem sessão

`src/middleware.ts`. O matcher excluía `favicon.png` e `favicon.ico`, mas não
`build-connect-icon.png` nem `apple-touch-icon.png`. Os dois respondiam **307 → /login**.

Não era bug do módulo de integração: o `Logo` é compartilhado, então a **tela de login
também estava com o logo quebrado**. Ninguém via porque quem está logado passa pelo
middleware sem redirecionar.

### 2. Quem está logado não conseguia abrir o convite

`src/middleware.ts`. A linha era `if (authed && isPublic) → redirect("/")`, mas o
comentário acima dela dizia "Logado tentando ver o login → manda pra home". `isPublic`
inclui `/integracao`, então **qualquer** pessoa logada era expulsa da página do convidado.

Na prática: o DHO copiava o convite, clicava para conferir e caía no sistema. E,
pior, a sessão do sistema principal passava a decidir sobre um módulo que promete não
consultá-la. Agora só `/login` redireciona.

### 3. As capas quebravam na primeira visita de todo convidado

`src/components/integration/film-block.tsx`. A trilha renderiza **atrás do portão de
boas-vindas**, quando ainda não existe cookie de convidado. As quatro capas eram pedidas
ali, a rota respondia 401, e o navegador marcava as imagens como falhas. Ao confirmar a
identidade, o React re-renderizava com o **mesmo `src`** — e o navegador não repete um
pedido que já falhou.

Resultado: todo convidado via quatro cartazes quebrados até apertar F5. A capa agora só
é pedida depois do portão.

### 4. Dois avisos contraditórios ao mesmo tempo

`film-block.tsx`. Depois de reprovar e acertar na segunda tentativa, a tela mostrava
"Você acertou 3 de 5 — assista novamente" **junto** com "Filme concluído". O estado
`reproved` nunca era limpo. Limpa no envio, não ao reassistir: enquanto a pessoa revê o
filme, o aviso tem de continuar lá.

### 5. Excluir material não pedia confirmação

Um clique na lixeira apagava o filme com as cinco perguntas, o gabarito e as tentativas
já gravadas. Sem pergunta nenhuma. Agora há modal, no mesmo desenho do
`personnel-panel`, e o aviso é explícito sobre o que vai junto.

---

## A conclusão deixou de ser derivada

É a mudança estruturante da sessão, e resolve três pedidos de uma vez.

Antes, "concluiu a trilha" era **calculado**: existe tentativa aprovada em todo filme?
Isso tinha duas consequências ruins, as duas observadas na tela:

- **cadastrar um filme novo devolvia a pendente quem já tinha terminado.** A conta mudava
  de denominador e a pessoa "desconcluía" — continuando revogada, então teria de ser
  reaberta à mão, uma por uma;
- **quem terminava recebia um 404 na cara.** `finishIfDone` escrevia `revokedAt` no
  instante do último acerto, e a página sumia para a pessoa que acabara de concluir os
  quatro filmes. Estava documentado como intencional em `page.tsx`, mas é difícil
  imaginar que alguém tenha visualizado a cena.

Agora a conclusão é **fato gravado**, em dois campos novos de `IntegrationGuest`:

| Campo | O que é |
| --- | --- |
| `completedAt` | quando a trilha terminou. Gravado uma vez, nunca apagado. |
| `accessUntil` | fim da janela de acesso. Nasce em +24 h e é renovado pelo Reabrir. |

São dois, e não um, por causa do **Reabrir**: a conclusão é permanente, então reabrir um
convite vencido não teria efeito nenhum se o prazo saísse de `completedAt` — fecharia a
porta de novo na leitura seguinte. Separar deixa cada campo com um trabalho só.

### As três regras, num lugar só

`src/lib/integration/access.ts` — puro e testado, como `trail.ts` e `grade.ts`:

- **acesso fechado** = revogado à mão **ou** janela vencida;
- **janela** = 24 h, contadas da conclusão;
- **coluna** = sem `completedAt` → Pendentes; dentro de 15 min → Concluídos; passou →
  Histórico.

Não há cron nem gravação na leitura. A janela vence por comparação de data, no momento em
que alguém pergunta. Quem lê essas regras são três lugares diferentes — a página do
convidado, a rota do arquivo e o quadro do DHO — e é por isso que elas moram juntas.

### Migration com backfill

`20261103120000_integracao_conclusao_e_janela`. Além das colunas, ela **marca como
concluído quem foi fechado pelo modelo antigo tendo aprovado todos os filmes** — a data é
a da última tentativa aprovada. Sem isso, esses convidados ficariam "Encerrado" para
sempre e nunca apareceriam no histórico.

---

## O quadro do DHO virou kanban de verdade

- **Largura.** A aba entra em modo `wide` do `AppShell`, como a de chamados já fazia
  (`hr-sector-view.tsx`). Era só isso que faltava: as colunas existiam, mas espremidas em
  `max-w-6xl`.
- **Quatro cards por coluna, depois rola.** O quadro de chamados já resolvia isso medindo
  a base do N-ésimo card com `ResizeObserver` — altura de card varia, então um
  `max-height` fixo em pixels não serve. Extraí para
  `components/ui/use-card-list-limit.ts` e as duas telas usam o mesmo hook. A retaguarda
  segue em 3 cards; a integração usa 4.
- **Histórico.** Botão no cabeçalho, no mesmo desenho do quadro de chamados, abrindo um
  modal com quem terminou, quando terminou e o atalho para as respostas.

---

## "Nossa história"

`src/components/integration/story-timeline.tsx`, alimentado por `COMPANY_STORY` em
`lib/company-info.ts`. Oito capítulos — Fortaleza, a avó e a máquina vermelho carmim, os
16 anos, Carlos, 2014, 2018, 2019, hoje — numa linha do tempo vertical.

Duas decisões que vale registrar:

**Tudo visível, sem sanfona.** A tentação era esconder cada capítulo atrás de um clique
para "ficar interativo". Mas esta é a primeira coisa que o convidado lê sobre a empresa:
esconder obriga a descobrir, e quem está sendo integrado não sabe que há o que descobrir.
A interação fica onde ajuda — a foto abre ampliada, no `ImageLightbox` da casa.

**As fotos estão PENDENTES e a seção não depende delas.** `photo` é opcional capítulo a
capítulo; sem nenhuma, a linha do tempo continua inteira e bem formada. Para acrescentar,
ponha o arquivo em `public/historia/` e aponte no capítulo:

```ts
photo: { src: "/historia/deli.jpg", alt: "Deli no ateliê" }
```

`public/`, e não `/uploads`, porque isto é configuração institucional versionada junto do
código, como o logo — não material que o DHO troca pela tela.

---

## O questionário ficou paginado

Uma pergunta por página, com "Pergunta N de 5", Anterior/Próxima, e o Enviar só na
última — desabilitado enquanto faltar resposta. "Próxima" **não** exige ter respondido:
dá para pular e voltar, e em branco continua valendo erro, que era o comportamento
anterior.

O ganho não é estético: com as cinco perguntas na tela, o vídeo era empurrado para fora
justamente quando ele é a referência da resposta.

---

## O que foi exercitado de verdade no navegador

Tudo abaixo foi clicado, não deduzido:

- portão, trilha, player, questionário, reprovação, reaprovação e destravamento;
- a trilha **inteira** até o fim — `finishIfDone` rodou pela primeira vez;
- **isolamento provado nos dois sentidos**: forjei um token válido de cada domínio; cada
  um funciona no seu (200 e 206) e **falha ao ser trocado** (401 e 307). Não havia teste
  nenhum cobrindo isso, que é o requisito central do módulo;
- **trava da trilha no servidor**: com filmes trancados *com arquivo*, pedir o id do 3º e
  do 4º direto dá **403**; sem cookie, 401;
- **Range**: `bytes=0-1023`, faixa no meio, sufixo `bytes=-500` e `bytes=0-` — todas 206
  corretas num arquivo de 1,36 GB. O `.mkv` toca no Chrome;
- quadro do DHO: três colunas, detalhe das respostas, editor de perguntas, novo convite,
  upload de documento, exclusão (que **também apaga o arquivo do disco**), revogar e
  reabrir;
- **trocar o gabarito não reprova retroativamente** — a tentativa gravada continuou 5/5.

---

## O grafo de conhecimento do projeto

O `/graphify` nunca tinha rodado aqui. Rodou, e a saída fica em `graphify-out/`:

| Arquivo | O que é |
| --- | --- |
| `graph.html` | grafo interativo, abre no navegador, sem servidor |
| `GRAPH_REPORT.md` | relatório de auditoria com comunidades, nós centrais e lacunas |
| `graph.json` | dados brutos, prontos para GraphRAG |

**3210 nós, 10267 arestas, 167 comunidades**, de 559 arquivos. Zero arestas órfãs.

O custo ficou baixo porque 552 dos 559 arquivos são código e saem por AST, sem LLM
nenhum. Só 8 arquivos — três documentos de sessão, quatro ícones e o documento de hoje —
passaram por extração semântica.

Duas decisões sobre ele:

- **`graphify-out/` entrou no `.gitignore`.** É saída de ferramenta, refeita a partir do
  código a qualquer momento; versionar seria commitar um cache.
- **As 167 comunidades são rotuladas pelo diretório dominante, não à mão.** Rotular por
  id quebra na primeira reclusterização — aconteceu nesta sessão, quando um `update`
  passou de 162 para 175 comunidades e renomeou 41 sozinho. Derivar do conteúdo
  sobrevive a isso. Um `graphify label` refina os nomes depois, se valer a pena.

### O que ele encontrou que ninguém tinha perguntado

As conexões mais úteis são entre documentos de sessões diferentes:

- `Trilha trancada (trail.ts)` ↔ `folderStatus(temArquivo, vencimento, hoje)` — os dois
  derivam estado de uma função pura testada em vez de guardá-lo;
- `Ausência de tabela de progresso (uma verdade só)` ↔ `Checkbox derivado e não
  clicável` — o mesmo princípio em dois módulos que não se falam;
- `getTrail` ↔ `notifyPersonnelExpiring()` — ambos reusam a regra única do servidor para
  que tela e servidor não possam discordar;
- `nextSlot` ↔ `GET /api/cron/evaluations`; `setup:integracao` ↔ `setup-funil-vendas.ts`.

Vale registrar a tensão: **as duas primeiras descrevem exatamente o princípio que esta
sessão quebrou de propósito.** "Derive, não guarde" é o que fazia um filme novo
desconcluir quem já tinha terminado. O grafo guarda os dois lados — o princípio no
documento de 28/10 e a exceção fundamentada neste aqui.

### Ressalvas honestas sobre o grafo

- **247 arestas colapsadas.** São pares ligados mais de uma vez: uma migration que cita
  `User` em cinco linhas, `forms/data.ts` que importa *e* re-exporta `data-core`.
  Esperado num grafo não direcionado; não é corrupção.
- **1 aresta órfã e 4 laços próprios** em 10.433 brutas. Resíduo.
- **Nó duplo para documento e código.** Existe `stream-file` como "arquivo" e como "o que
  o documento diz sobre ele". Ao consultar, aparecem como vizinhanças separadas.

---

## Estado do repositório

**Nada foi commitado.** Tudo segue na árvore de trabalho, junto com o módulo inteiro de
28/10. A migration `20261103120000_integracao_conclusao_e_janela` **já foi aplicada** no
banco de desenvolvimento.

Arquivos novos desta sessão:

```
src/lib/integration/access.ts            regras de acesso e coluna (puro)
src/lib/integration/access.test.ts       10 testes das três regras
src/components/integration/story-timeline.tsx
src/components/ui/use-card-list-limit.ts limite de cards, extraído da retaguarda
prisma/migrations/20261103120000_integracao_conclusao_e_janela/
```

Tocados fora do módulo, e vale saber por quê:

- **`src/middleware.ts`** — duas correções que afetam o sistema todo (ícones e o
  redirecionamento de rota pública).
- **`src/components/it/kanban-column.tsx`** — passou a usar o hook extraído. Mesma
  medição de antes, agora num lugar só. Continua em 3 cards; a integração usa 4.
- **`src/components/hr/hr-sector-view.tsx`** — a aba de integração entra em modo largo.
- **`src/lib/company-info.ts`** — `COMPANY_HISTORY` (string vazia) deu lugar a
  `COMPANY_STORY` (capítulos).
- **`.gitignore`** — `graphify-out/`.

O banco de desenvolvimento foi devolvido ao estado do início da sessão: um convidado sem
entrada, sem conclusão e sem revogação; quatro filmes, um com arquivo; zero tentativas;
fila de WhatsApp vazia.

---

## Comandos

```bash
npx prisma migrate dev --skip-seed    # aplica a migration nova
npm run lint && npm run typecheck && npm test && npm run test:db

graphify update                       # grafo: só o que mudou (código, sem LLM)
graphify query "como a trilha destrava?"
```

Estado em 03/11/2026: **429 unitários + 171 contra banco**, zero falhas, lint e typecheck
limpos. O banco de desenvolvimento foi devolvido ao estado do início da sessão.

> Depois da migration, **reinicie o `npm run dev`**. O processo antigo segura o cliente
> Prisma em memória e responde 500 nas telas do módulo até ser reiniciado — não é bug do
> código.

---

## Pendente

**Precisa de alguém de fora:**

- **As fotos da história** (ver acima: `public/historia/`).
- **Os arquivos de 3 dos 4 filmes.** Só "Poder Além da Vida" foi enviado.

**Falta construir:**

- **Reordenar perguntas** no editor, e **reordenar filmes** pela tela. Os dois seguem
  pendentes de 28/10.
- **Teste de regressão do isolamento.** Provei à mão que trocar os cookies falha nos dois
  sentidos, mas **não deixei teste**. Hoje, se alguém apagar o prefixo `convidado:` da
  assinatura em `guest-session.ts`, nada quebra em lugar nenhum — e esse prefixo é o que
  sustenta o módulo. Custa um `export` da função `sign` e umas quinze linhas; não fiz
  porque mexer na superfície pública de um módulo de sessão só para testá-lo é uma
  escolha de projeto, não minha.

**Decisões em aberto, com o que eu recomendaria:**

- **Ordem duplicada passa sem aviso.** Cadastrei um filme de teste com a ordem padrão
  `1` e ele foi para a frente da fila, ao lado do filme 1 real. Como nascia sem arquivo,
  **nunca poderia ser concluído** — e os quatro filmes reais viraram "Bloqueado" para
  todos os convidados. É exatamente o fluxo documentado ("cadastra agora, sobe o vídeo
  depois"). Recomendação: ou o cadastro sugere `última ordem + 1`, ou filme sem arquivo
  sai da trilha até ter arquivo.
- **`cache-control: private, max-age=3600`** na rota de arquivo deixa o filme reabrível
  do cache por até 1 h depois da revogação. O `stream-file.ts` recomenda `no-store` para
  material sensível, mas `no-store` atrapalharia o seek do vídeo. Como está, a janela de
  24 h tornou a diferença bem menor.
- **`GUEST_RETRY_TEXT`** continua sem citar a nota. A tela já cita ("Você acertou 3 de
  5"); só o WhatsApp não.

**Nunca foi exercitado:**

- **Upload de vídeo grande.** O limite de 4 GB e o proxy reverso seguem sem prova — o
  único upload testado foi um PDF de 193 bytes.
- **O envio do WhatsApp de ponta a ponta.** Está provado que entra na fila com o texto
  certo e com `guestId` no lugar de `userId`; não que o número pareado entrega.
- **Telas em largura de celular.**
- **Os 503 nos saltos do vídeo.** Metade das requisições de faixa voltou 503 quando o
  player pulava de posição. O vídeo tocou — o navegador repete — e com requisições
  limpas nunca reproduzi: as faixas respondem 206 corretas, inclusive sufixo, num
  arquivo de 1,36 GB. A leitura é que o dev server do Next aborta o stream que o player
  cancelou. **Em `next start`, atrás do proxy, pode se comportar diferente**; vale um
  olho no primeiro convidado real.

**Resíduos desta sessão, para limpar quando quiser:**

- **Um segundo `next dev` ficou rodando em `:3001`.** Subi para validar depois da
  migration, porque o servidor original segurava o cliente Prisma antigo. Pode derrubar.
- **`build-connect-icon.png` existe duas vezes**: na raiz e em `public/`. Só o de
  `public/` é servido — a URL `/build-connect-icon.png` resolve para lá. O da raiz é
  rastreado pelo git e parece resto, mas não apaguei arquivo versionado por conta
  própria.
- **Detalhes de interface**, pequenos: "Copiar convite" não dá retorno visual nenhum, e
  o campo de telefone do convite não aplica máscara apesar do placeholder sugerir uma.

**Uma coisa sem explicação:** em algum momento entre 13h40 e 14h10 (UTC) o `revokedAt` do
convidado "Marcos Lucas" foi escrito no banco de desenvolvimento sem que eu identificasse
o quê. Repeti o `test:db` isolando a hipótese mais provável e a suíte **não** reproduziu.
O campo foi restaurado. Fica registrado porque uma escrita não explicada numa linha real
merece um segundo par de olhos.
