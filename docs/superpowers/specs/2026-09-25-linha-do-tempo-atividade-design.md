# Histórico do Colaborador: bloco "Atividade" — design

Data: 2026-09-25. Aguardando aprovação.

## Objetivo

O bloco "Atividade" no Histórico do Colaborador (DHO): a linha do tempo do que
uma pessoa fez na plataforma, do cadastro ao último evento, em ordem
decrescente.

Hoje aquele espaço era ocupado por "Feedbacks recebidos", um cartão fixo em
zero com a etiqueta "em breve". Ele já saiu, junto com o bloco "Média" que
tomou seu lugar (commit `2c19f54`). Esta spec trata do que vem ao lado da
Média.

## O problema que decidiu o desenho

Todos os tipos de evento pedidos já têm data no banco, com uma exceção. **Login e logout
não têm.** A sessão é um cookie assinado, sem estado no servidor
([session.ts](../../../src/lib/auth/session.ts)): não existe tabela de sessão,
e nada é escrito quando alguém entra ou sai.

Isso abre três caminhos, e eles não são equivalentes:

| Caminho | Histórico retroativo | Login/logout | Custo |
|---|---|---|---|
| Só derivar das tabelas existentes | Completo desde sempre | Impossível | Nenhuma migration |
| Só gravar numa tabela nova | **Vazio** para todos os cadastros atuais | Sim | Instrumentar todo ponto de escrita |
| **Híbrido** | Completo desde sempre | A partir do deploy | Uma migration, dois pontos de escrita |

**Decisão do usuário (25/09): híbrido.** Os sete eventos deriváveis continuam
sendo lidos de onde já moram, e a tabela nova existe só para o que não tem
outra origem. É o único caminho em que a tela nasce útil: uma linha do tempo
vazia no dia do deploy, para uma empresa inteira já cadastrada, não responderia
a nenhuma pergunta que o DHO tem hoje.

**Consequência registrada, e aceita:** a linha do tempo é assimétrica no tempo.
Eventos anteriores ao deploy existem para as sete origens derivadas e não
existem para login/logout. A tela diz isso (ver §5), em vez de deixar o DHO
concluir que a pessoa nunca entrou na plataforma.

## 1. Os tipos de evento

| Tipo | Origem | Campo de data | Detalhe exibido |
|---|---|---|---|
| `CADASTRO` | `User` | `createdAt` | — |
| `LOGIN` | **`ActivityEvent`** | `occurredAt` | — |
| `LOGOUT` | **`ActivityEvent`** | `occurredAt` | — |
| `VIDEO_ASSISTIDO` | `ContentProgress` | `endedAt` | Título do vídeo |
| `RESPOSTA_COMPREENSAO` | `VideoComprehension` | `submittedAt` | Título do vídeo, tentativa |
| `AVALIACAO_VIDEO` | `VideoRating` | `createdAt` | Título do vídeo, média dos critérios |
| `AVALIACAO_DESIGNADA` | `EvaluationAssignment` | `createdAt` | Título do tipo, quem ele avalia |
| `AVALIACAO_ABERTA` | `EvaluationRound` | `createdAt` | Título do tipo |
| `AVALIACAO_RESPONDIDA` | `Evaluation` | `createdAt` | Título do tipo, ciclo, total |
| `CHAMADO_ABERTO` | `Ticket` | `createdAt` | Código (#2051), título, destino |

**Dez tipos, nove consultas** (`LOGIN` e `LOGOUT` saem da mesma tabela) para os
oito itens do pedido. A diferença não é inflação: são distinções que existem no
modelo e que o DHO lê de formas diferentes.

"Avaliações atribuídas aos vídeos" e "atribuição de avaliações ao usuário" são
coisas separadas. `VideoRating` é a opinião do colaborador **sobre o vídeo** —
ele julgando o material. As outras duas são avaliação de desempenho, e aí o
modelo separa dois papéis:

- `EvaluationAssignment.raterId` — ele foi designado **para avaliar outra
  pessoa** ("designado para avaliar Fulano");
- `EvaluationRound.subjectId` — uma avaliação foi **aberta sobre ele**
  ("avaliação de Eficácia aberta sobre você").

Fundir os dois num evento só diria ao DHO que "houve uma avaliação" sem dizer
de que lado a pessoa estava, que é justamente a pergunta.

### Fora de escopo, deliberadamente

Notificações lidas, mensagens de WhatsApp, mudanças de status de chamado,
uploads de conteúdo e alterações de cadastro feitas pelo DHO. São eventos
sobre a pessoa, não ações dela; "demais eventos correlatos" vira ruído se não
tiver limite, e a linha do tempo perde a leitura que a justifica.

## 2. A tabela nova

```prisma
enum ActivityEventKind {
  LOGIN
  LOGOUT
}

/// Eventos que não têm outra origem no banco. Tudo o que já pode ser derivado
/// de uma tabela existente é derivado, e não duplicado aqui: duas verdades
/// sobre o mesmo fato divergem no dia em que uma delas for corrigida.
model ActivityEvent {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  kind ActivityEventKind

  /// Detalhe por tipo. Existe para o próximo tipo de evento não pedir
  /// migration; hoje LOGIN e LOGOUT não guardam nada.
  meta Json?

  occurredAt DateTime @default(now())

  @@index([userId, occurredAt])
}
```

`onDelete: Cascade` pela política já registrada no `Ticket`: "excluir um
usuário é apagar tudo dele".

## 3. Instrumentação

Dois pontos, ambos em [auth/actions.ts](../../../src/lib/auth/actions.ts):

- **`login`** — após `createSession`, antes do `return { ok: true }`. O
  `userId` está em mãos.
- **`logout`** — **antes** de `destroySession()`, porque depois dela não há
  mais de onde tirar o `userId`. Ler a sessão, gravar, então destruir.

Gravar não pode derrubar a ação: a escrita vai em `try/catch` com
`console.error`. Um log de auditoria que impede alguém de entrar na plataforma
é pior que um log com buraco.

### A assimetria do logout

Quase ninguém clica em "sair" — a maioria das sessões simplesmente expira. O
log vai registrar muito mais `LOGIN` que `LOGOUT`.

**Decisão: aceitar.** `LOGOUT` significa "clicou em sair", e a tela usa esse
texto, não "encerrou a sessão". Registrar expiração exigiria escrever no
caminho de verificação de sessão — que roda a cada requisição, para cada
usuário — e transformaria uma tabela de auditoria numa tabela de tráfego.

*Esta é a decisão mais fácil de reverter da spec. Se o DHO precisar mesmo saber
quando a sessão terminou, o caminho é um `lastSeenAt` no `User` atualizado com
janela de minutos, não um evento por requisição.*

## 4. Leitura: fundir nove fontes numa página só

`src/lib/activity-timeline.ts`, com a parte pura separada da consulta —
o padrão de `sector-overview.ts` / `sector-overview-data.ts`, que deixa os
testes rodarem sem banco.

### Ordem total

Ordenar só por data não basta: eventos gravados na mesma transação (um
`ContentProgress` e um `VideoComprehension`, por exemplo) podem cair no mesmo
milissegundo. A ordem é **(`occurredAt` desc, `kind` asc, `id` asc)** — um
desempate estável, que não depende da ordem em que as consultas voltaram.

### Paginação por cursor

Página de 30 eventos. O cursor é o par `{ occurredAt, id }` do último item
exibido, não só a data.

Cada uma das nove consultas pede `occurredAt <= cursor.occurredAt`, com
`take: 30`, e a fusão em memória mantém **apenas o que vem depois do cursor na
ordem total** — descartando o próprio cursor e tudo o que a página anterior já
mostrou. O `<=` (e não `<`) é o que impede perder um evento empatado no
milissegundo exato da virada de página; o descarte em memória é o que impede
repeti-lo.

Memória por página: 9 × 30 linhas. `nextCursor` é nulo quando a fusão devolve
menos de 30.

### Contrato

Server Action em `src/lib/activity-timeline-actions.ts`, no mesmo formato de
`fetchEmployeeHistory`:

```ts
fetchActivityTimeline(input: { userId: string; cursor?: ActivityCursor }): Promise<{
  ok: boolean;
  events?: ActivityEvent[];
  nextCursor?: ActivityCursor | null;
  error?: string;
}>
```

A primeira página vem junto do `EmployeeHistory` no `fetchEmployeeHistory` que
já existe — abrir um colaborador e só então disparar uma segunda ida ao
servidor faria o bloco piscar vazio a cada seleção.

## 5. Tela

O bloco entra ao lado da Média, como o pedido especifica:

```
<div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
  <Atividade />   {/* linha do tempo, rola dentro do próprio bloco */}
  <Média />       {/* o bloco que já existe, movido para cá */}
</div>
```

No celular empilham, Atividade primeiro.

Cada evento é uma linha com ícone da origem, texto e data/hora em Brasília
(`dateLabelBR` já existe; a linha do tempo precisa de **hora**, então entra um
`dateTimeLabelBR` ao lado dele em [brasilia.ts](../../../src/lib/brasilia.ts)).
Marcador vertical ligando os pontos, agrupado por dia.

"Carregar mais" ao final, que chama a Server Action com o cursor. Sem scroll
infinito: o DHO costuma procurar um evento específico, e scroll infinito tira
dele o controle de onde parou.

**O aviso da assimetria:** quando a página mais antiga é alcançada e ela
contém o `CADASTRO`, o rodapé do bloco diz que registros de entrada e saída
existem a partir de 25/09. Sem isso, um cadastro de 2024 sem nenhum `LOGIN`
lê-se como "nunca acessou".

## 6. Testes

**Puros** (`activity-timeline.test.ts`, sem banco) — é onde mora o risco:

- a ordem total desempata por `kind` e `id` quando as datas são iguais;
- o cursor não perde nem repete evento empatado no milissegundo da virada;
- fusão de nove listas devolve exatamente 30 e o `nextCursor` correto;
- última página devolve `nextCursor` nulo;
- lista vazia não quebra.

**Contra o banco** (`activity-timeline.dbtest.ts`):

- cada uma das nove origens vira o evento certo, com a data certa;
- `CADASTRO` é sempre o último;
- login grava `ActivityEvent`; logout grava antes de destruir a sessão;
- o log de uma pessoa não vaza para a linha do tempo de outra.

## 7. Permissões

Nenhuma permissão nova. O bloco vive dentro do Histórico do Colaborador, que já
está atrás de `sector.hr` — só Admin. A Server Action revalida essa permissão
no servidor em vez de confiar na tela, como as demais ações do módulo.

## 8. Ordem de implementação

1. Migration + modelo `ActivityEvent`.
2. Instrumentação de login/logout, com os dbtests.
3. `activity-timeline.ts` puro: ordem total, cursor, fusão — com os testes
   puros primeiro.
4. As nove consultas e o mapeamento de cada origem.
5. Server Action e a primeira página junto do `EmployeeHistory`.
6. `dateTimeLabelBR`.
7. O bloco na tela, e a Média movida para o lado dele.

## Fora de escopo

- Registrar expiração de sessão (ver §3).
- Exportar a linha do tempo.
- Filtro por tipo de evento. Entra quando houver volume que justifique; com 30
  por página e "carregar mais", o DHO ainda alcança o que procura.
- Linha do tempo do próprio usuário (em "Meu Progresso"). Esta spec é só o
  módulo do DHO.
