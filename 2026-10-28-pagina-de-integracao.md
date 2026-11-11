# Página de Integração — o módulo do convidado

28 de outubro de 2026

**Nada aqui foi commitado.** Está tudo na árvore de trabalho, e as migrations já foram
aplicadas no banco de desenvolvimento (`buildconnect_dev`).

Módulo novo: uma página pública onde um **convidado sem conta** conhece a empresa, assiste
quatro filmes em ordem e responde um questionário ao fim de cada um. O DHO convida por
link pessoal e acompanha tudo num quadro de três colunas.

---

## O que sustenta o módulo: isolamento nos dois sentidos

É o requisito, não um detalhe de implementação, e quase toda decisão estranha deste
documento sai daqui:

- **o convidado alcança esta página e NADA do sistema principal.** Não tem `User`, não tem
  `bc_session`, e o cookie que o identifica aqui não abre porta nenhuma lá;
- **o usuário do sistema principal não entra por aqui.** A página não lê a sessão dele em
  momento nenhum.

O que torna a troca de cookies **impossível**, e não só improvável, é a separação de
domínio na assinatura (`src/lib/integration/guest-session.ts`): o que se assina é
`convidado:<corpo>`. Um `bc_session` copiado para o cookie `bc_convidado` assina outro
texto e falha a conferência, mesmo com o mesmo `SESSION_SECRET`. Trocar só o nome do cookie
não daria essa garantia.

Duas conferências acontecem **sempre juntas** em `resolveGuest()`: a assinatura do cookie e
o convite no banco. A segunda não é redundante — a assinatura não sabe que o convite foi
revogado cinco minutos atrás, nem que a trilha terminou e o acesso se fechou sozinho. Sem a
consulta, revogar só teria efeito 12 horas depois.

---

## As regras

### Trilha trancada

Os filmes saem na ordem do campo `order`. O seguinte só abre quando o anterior é concluído.
A conta é pura e testada em `src/lib/integration/trail.ts`:

- o filme está **CONCLUÍDO** quando existe uma tentativa aprovada dele;
- está **LIBERADO** quando o anterior está concluído (o primeiro, sempre);
- qualquer outro, **TRANCADO**.

O cadeado da tela é cortesia. Quem decide é o servidor, na mesma `getTrail` que alimenta a
tela e na rota que entrega o arquivo — pedir o id do 4º filme direto não grava nada.

### Nota

`src/lib/integration/grade.ts`. A nota vai de 0 a 10 e **aprova a partir de 7**. Com as 5
perguntas por filme do material atual:

| Erros | Nota | Resultado |
| --- | --- | --- |
| 0 | 10,0 | aprovado |
| 1 | 8,0 | aprovado |
| 2 | 6,0 | **reprovado** → WhatsApp |

O escopo original dizia "errar duas reprova". Isso é **consequência** do piso de 7, não uma
regra separada — e é por isso que o número 2 não aparece no código. Um filme com outra
quantidade de perguntas continua correto sozinho (com 4 perguntas, 1 erro dá 7,5 e aprova).

Pergunta em branco conta como **erro**, nunca como anulada: deixar em branco não pode ser
mais barato que arriscar.

### Reprovação

A tentativa fica gravada, o filme **não** conclui, a trilha não anda, e entra na fila do
WhatsApp a mensagem que o DHO definiu ao pé da letra (`GUEST_RETRY_TEXT` em
`src/lib/whatsapp/messages.ts`). Na tela, o bloco do filme volta ao início: é preciso
assistir de novo para o questionário reaparecer. Sem isso a pessoa chutaria a alternativa
seguinte até acertar, que é o oposto de rever o filme.

### Revogação automática

Concluída a trilha inteira com aproveitamento, o convite se fecha sozinho
(`finishIfDone` em `guest-core.ts`). O cookie continua assinado, mas `resolveGuest` confere
`revokedAt` no banco a cada leitura. O DHO pode reabrir pelo quadro.

---

## Mapa de arquivos

### O módulo

| Arquivo | O que faz |
| --- | --- |
| `src/lib/integration/trail.ts` | destravamento da trilha — **puro, testado** |
| `src/lib/integration/grade.ts` | nota e correção contra o gabarito — **puro, testado** |
| `src/lib/integration/guest-session.ts` | cookie `bc_convidado`, assinado com separação de domínio |
| `src/lib/integration/data.ts` | leitura da página; entrega as perguntas **sem** o gabarito |
| `src/lib/integration/guest-core.ts` | responder, concluir, fechar o convite (recebe `guestId`) |
| `src/lib/integration/public-actions.ts` | Server Actions públicas: só cookie e tetos por IP |
| `src/lib/integration/questions-core.ts` | edição do questionário, com medida de perda |
| `src/lib/integration/admin-data.ts` | quadro do DHO e detalhe das tentativas |
| `src/lib/integration/admin-actions.ts` | convites, materiais, upload, questionário |
| `src/app/integracao/[token]/page.tsx` | a página do convidado |
| `src/app/api/integracao/arquivo/[assetId]/route.ts` | entrega filme, documento e capa |
| `src/components/integration/` | `integration-view`, `film-block`, `welcome-gate` |
| `src/components/hr/integration-page-panel.tsx` | quadro de 3 colunas no DHO |
| `src/components/hr/integration-questions-modal.tsx` | editor de perguntas e gabarito |

### O que foi tocado FORA do módulo

Importa saber, porque não é óbvio pelo nome dos arquivos:

- **`src/lib/storage/stream-file.ts` (novo)** — o streaming com Range foi extraído de
  `app/uploads/[...path]/route.ts`, que caiu de 203 para 86 linhas. As duas rotas
  compartilham a **entrega**; a **autorização** de cada uma continua separada, e foi
  deliberado: o portão do acervo não podia ganhar uma brecha para o convidado.
- **`src/lib/whatsapp/outbox.ts`** — `WhatsappMessage.userId` virou anulável e ganhou
  `guestId`. O número **continua não sendo copiado** para a tabela: é resolvido na hora do
  envio, do cadastro ou do convite. O cálculo de horário da fila foi extraído em `nextSlot`
  — as duas filas são o mesmo número de WhatsApp, e espaçamento duplicado é o que faz o
  número ser bloqueado.
- **`src/lib/utils.ts`** — `formatBytes` ganhou degrau de GB (ver abaixo).
- **`src/lib/forms/data-core.ts`** — voltou ao original. Houve uma fase em que o
  questionário era um `Form` comum e precisava ser excluído da lista do DHO; não é mais.

---

## Schema

Cinco tabelas, todas com prefixo `Integration`:

- **`IntegrationGuest`** — *o convidado É o convite*. `token` (credencial), `fullName`,
  `phone`, `confirmedAt`, `revokedAt`. Eram duas tabelas (link + convidado) até o convite
  virar pessoal; manter duas em 1:1 só criava a pergunta de qual delas é a pessoa.
- **`IntegrationAsset`** — filme da trilha, vídeo complementar ou documento. `filePath`,
  `thumbnailPath`, `order`, `focus`, `lesson`.
- **`IntegrationQuestion`** / **`IntegrationOption`** — pergunta e alternativas, com
  `correct` marcando o gabarito.
- **`IntegrationAttempt`** — uma rodada de respostas. Guarda `correctCount` e `totalCount`,
  **não a nota**: o cálculo mora num lugar só, e mudar o piso de aprovação não reescreve
  linha nenhuma já gravada.
- **`IntegrationAnswer`** — o que foi marcado em cada pergunta da tentativa.

### Decisões que parecem erro e não são

**Por que tabela própria e não o motor de formulários do DHO.** Foi tentado primeiro: o
questionário era um `Form` comum, anexado ao filme por um seletor. Não serve por uma razão
de modelo — formulário de avaliação e de pesquisa **não tem resposta certa**, e marcar
"esta é a correta" lá dentro espalharia um conceito de prova por um motor que existe para
colher opinião.

**Por que tabela própria e não `Video`/`Document`.** Aqueles dois pertencem a um
**subsetor** e entram na contagem de progresso do colaborador (`lib/progress-data`), no
histórico e na vitrine do subsetor. Um filme de integração caindo nessas listas seria
conteúdo de setor que ninguém cadastrou.

**Por que não existe tabela de progresso.** O filme está concluído quando há uma tentativa
aprovada. Uma tabela à parte seria uma segunda verdade sobre o mesmo fato, e as duas
divergem no primeiro bug. É por isso que filme **sem** questionário conclui gravando uma
tentativa aprovada de zero perguntas — parece estranho, e é o que mantém uma representação
só.

**Por que a capa não passa pela trava da trilha.** O convidado precisa ver o cartaz do
filme que ainda não pode assistir — é o que faz a trilha parecer uma trilha, e não uma
lista de linhas cinzas. O que a trava protege é o filme em si.

**Por que `getTrail` não devolve o gabarito.** As perguntas são renderizadas junto do vídeo,
no mesmo bloco, então estão no HTML que chega ao navegador. Mandar qual é a correta junto
entregaria a prova com o enunciado. O gabarito é lido **só** em `submitQuizFor` e no editor
do DHO.

**Por que trocar o gabarito não reprova ninguém retroativamente.** A tentativa guarda os
acertos do momento do envio. A pessoa respondeu o que estava escrito na tela dela.

---

## Conteúdo atual

Quatro filmes, cinco perguntas cada, 20 gabaritos marcados — tudo do PDF do DHO
(28/10/2026):

1. Poder Além da Vida — *Autoconhecimento e Presença*
2. O Segredo (Documentário) — *Mentalidade e Intenção*
3. O Segredo: Ouse Sonhar — *Perspectiva e Atitude*
4. Joy: O Nome do Sucesso — *Ação e Resiliência*

**As alternativas estão embaralhadas de propósito.** No PDF de origem a correta é sempre a
primeira das três; gravar nessa ordem deixaria o questionário respondível sem assistir a
nada. A ordem no seed é fixa, não sorteada: o que o convidado vê é o mesmo que o DHO revisa.

As **capas** saíram das imagens da pasta `Downloads/Integração`, padronizadas em 640×360
webp com `contain` sobre preto. Cortar pôster 2:3 para 16:9 comeria mais da metade da
altura e levaria o título junto. O mapa arquivo→filme é **explícito** em
`scripts/setup-integracao-capas.ts`, porque os nomes não batem ("Joy, *Um* nome do sucesso"
contra "Joy: *O* Nome do Sucesso") e casamento aproximado trocaria capas em silêncio.

---

## Limite de upload: 1 GB → 4 GB

Mudança à parte, feita na mesma sessão. **Quatro valores acoplados**, não um:

| Onde | Valor |
| --- | --- |
| `src/lib/storage/limits.ts` → `MAX_BYTES.video` | 4 GB |
| `src/lib/storage/limits.ts` → `MAX_REQUEST_BYTES` | 4112 MB |
| `next.config.mjs` → `bodySizeLimit` e `middlewareClientMaxBodySize` | `4112mb` |
| `scripts/http-request-timeout.cjs` | 5 h |

O que decide o número é **tempo**, não byte: 4 GB a 4,8 Mbps (a banda medida em produção)
levam ~120 min, e o `requestTimeout` estava em 60. Subir só os bytes entregaria um limite
mentiroso — o envio morreria na metade com um `ECONNRESET` mudo. Há um teste em
`src/lib/storage/http-request-timeout.test.ts` que **amarra os três**: ele recalcula o
tempo do pior envio e falha se o timeout não cobrir com 2× de folga.

**Dois limites fora do repositório**, que matam o envio em silêncio se não acompanharem:

1. **O proxy reverso** (Traefik/Easy Panel) tem teto de corpo e timeout de leitura
   próprios. É o risco número um.
2. **Memória**: o corpo é bufferizado inteiro antes de ir ao disco — ~4 GB de RSS por
   envio, contra ~11 GB livres no host. **Um por vez cabe; dois simultâneos, não.** Se isso
   virar problema, o remédio é streaming multipart para o disco, não um número maior.

`npm run dev` **não** carrega o script de timeout (só o `start` carrega), então um envio
grande falha em 300 s na máquina local.

---

## Comandos

```bash
npx prisma migrate deploy && npx prisma generate   # migrations
npm run setup:integracao                           # 4 filmes + 20 perguntas com gabarito
npx tsx scripts/setup-integracao-capas.ts [pasta]  # capas (padrão: Downloads/Integração)
```

Os dois scripts são **idempotentes**: rodar de novo não duplica nada e não apaga tentativa.

Verificação:

```bash
npm run lint && npm run typecheck && npm test && npm run test:db
```

Estado em 28/10/2026: **419 unitários + 170 contra banco**, zero falhas, lint e typecheck
limpos.

> `npx prisma migrate deploy` pode ser recusado pelo classificador do auto mode por conter
> a palavra "deploy". Em desenvolvimento, `npx prisma migrate dev --skip-seed` passa e é o
> comando correto para um banco local.

---

## Pendente

**Precisa de alguém de fora:**

- **Os arquivos de 3 dos 4 filmes.** Só "Poder Além da Vida" foi enviado. Os outros sobem
  pelo quadro do DHO (é por lá que existe a barra de progresso).
- **O PDF de história / missão / visão.** O slot está em `src/lib/company-info.ts`
  (`COMPANY_HISTORY`, hoje string vazia — a seção some sozinha enquanto estiver assim).

**Falta construir:**

- **Reordenar perguntas** no editor. A ordem é a da lista e hoje só muda apagando e
  recriando. São dois botões de seta.
- **Reordenar filmes** pela tela. O campo `order` existe e é editável no cadastro, mas não
  há arrastar.

**Nunca foi exercitado:**

- **Navegador.** Nenhuma tela deste módulo foi aberta de verdade em nenhum momento. A
  cobertura é de teste automatizado e tipo, não de clique.
- **O envio do WhatsApp de ponta a ponta.** Está provado que a cobrança **entra na fila**
  com o texto certo; não que o número pareado a entrega.
- **A rota que entrega arquivo ao convidado** (`/api/integracao/arquivo/[assetId]`) não tem
  teste automatizado. Será exercitada de verdade quando o primeiro convidado abrir um filme.

**Decisão em aberto:**

- `GUEST_RETRY_TEXT` sai sem citar a nota nem quantas a pessoa errou — foi leitura literal
  do texto que o DHO passou. Se quiserem "você acertou 3 de 5", é uma linha.
