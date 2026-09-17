# Instruções em Vídeo: conclusão automática, avaliação de compreensão, 4 colunas e paginação

Data: 2026-09-16.

## Objetivo

1. O botão "Marcar como assistido" sai de **todos** os vídeos (card e lista, em
   toda aba de vídeo).
2. Na ferramenta **Instruções em Vídeo** (todo setor que a tem: setores padrão e
   Retaguarda/TI), **chegar ao fim do vídeo** abre a pergunta "Você compreendeu
   a atividade? Pode explicar um pouco?" (texto livre) — e é **responder que
   marca o vídeo como assistido** (revisão de 17/09; a regra dos 80 % foi
   descartada). A resposta vai para
   **Minhas Avaliações** dos Gestores do setor do usuário, que dão **nota de 0 a
   10**. Depois da nota, resposta e nota aparecem em **DHO › Resultados de
   Avaliações**, num card próprio.
3. A aba Instruções em Vídeo passa a exibir **4 vídeos por linha** ocupando a
   tela como o Cronograma, com **16 por página** (4 linhas).

Vídeos da Coleção e Workshop (vitrines): só perdem o botão. **Não há regra de
conclusão** nas vitrines — sem pergunta, sem selo, sem 4 colunas, sem paginação.

## Contexto que decidiu o desenho

- O player ([video-modal.tsx](../../../src/components/sector/video-modal.tsx))
  usa `<video controls>` nativo. O gatilho é o evento `ended`; a resposta
  escrita (avaliada pelo Gestor) é o filtro de compreensão — não há rastreio
  de trechos reproduzidos.
- "Assistido" já é `ContentProgress` e alimenta a barra "Concluído" do setor e o
  conteúdo pendente. A semântica não muda; só o gatilho.
- A aba Instruções em Vídeo é identificada pela **aba**, não pelo `kind`:
  setores padrão mostram ali todo vídeo que não é `WORKSHOP` (há `VIDEO` antigos).
  O servidor valida "vídeo de subsetor `PADRAO` e `kind ≠ WORKSHOP`", não
  `kind = INSTRUCAO`.
- Minhas Avaliações lista `MyEvaluationTask` (3 tipos) e o contador vermelho vem
  de `countMyPendingEvaluations`. Resultados de Avaliações é um catálogo em 3
  níveis (instrumento → colaborador → registro) montado sobre `EvaluationType`.
  A nota 0–10 não cabe na escala 1..`scaleMax` dos instrumentos; o registro
  ganha tabela própria e um card sintético no catálogo (como "Atribuir
  Avaliações" já é).
- `paginate()` + `<Pagination>` já existem (Gestão de Usuários).

## 1. Modelo de dados

```prisma
model ContentProgress {
  // ...campos atuais...
  // Quando o vídeo chegou ao fim para este usuário: libera a pergunta de
  // compreensão. `completed` continua sendo o que conta como assistido — vira
  // true ao enviar a resposta.
  endedAt DateTime?
}

model VideoComprehension {
  id      String @id @default(cuid())
  userId  String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoId String
  video   Video  @relation(fields: [videoId], references: [id], onDelete: Cascade)

  answer      String   @db.Text
  submittedAt DateTime @default(now())

  // Nota do Gestor (0–10). Nulo enquanto pendente.
  grade         Int?
  graderComment String?  @db.Text
  gradedById    String?
  gradedBy      User?    @relation("VideoComprehensionGrader", fields: [gradedById], references: [id], onDelete: SetNull)
  gradedAt      DateTime?

  @@unique([userId, videoId])
  @@index([gradedAt])
  @@index([videoId])
}
```

`ContentProgress` passa a existir com `completed: false` (chegou ao fim, não
respondeu) e vira `completed: true` ao enviar a resposta. Leituras que hoje
tratam "existe linha = assistido" passam a olhar `completed` (sector-data,
progress-data, pending-content, hr-history).

## 2. Player e fim do vídeo

- `<video onEnded>` (só na aba de Instruções): `markVideoEnded({ videoId })`
  grava `endedAt` (uma vez) e abre a pergunta se ainda não respondida. Nas
  vitrines o evento não faz nada.
- Concluído uma vez, não volta atrás (não há mais "desmarcar").
- `WatchToggle` some. Na aba de Instruções entra um selo somente-leitura:
  "Responder" (chegou ao fim, sem resposta) · "✓ Assistido" (respondeu) ·
  "✓ Avaliada" (nota dada) · nada (não terminou). Vitrines não mostram selo.

`setContentProgress` (marcar/desmarcar) sai com o botão. Documentos não usam
essa action (não há botão de "lido").

## 3. Formulário de compreensão (só Instruções em Vídeo)

- `VideoCard`/`VideoListRow` recebem `comprehension?: boolean` (a página passa
  `true` na aba `instrucoes-video`; a TI também). `VideoItem` ganha
  `comprehension?: "ENVIADA" | "AVALIADA"` (ausente = nunca respondeu) e
  `ended?: boolean`.
- Gatilho: o `ended` do vídeo, só se `comprehension` estiver ativo e o usuário
  ainda não tiver respondido. Enviar a resposta é o que conclui o vídeo. O formulário aparece
  **dentro do modal do player**, abaixo do vídeo (sem overlay sobre overlay):
  a frase padrão, `Textarea`, "Enviar" e "Responder depois".
- "Responder depois": o card fica com "Responder"; clicar no card reabre o
  player já com o formulário visível (não precisa reassistir).
- `submitVideoComprehension({ videoId, answer })`: usuário logado; vídeo
  existente, `kind ≠ WORKSHOP`, subsetor de setor `PADRAO`; exige `endedAt`;
  resposta 10–4000 caracteres; `create` + `completed: true` na mesma
  transação — se já existe, devolve erro "Você já respondeu".
- Quem avalia não é gravado no envio: é resolvido na leitura (§4). Assim,
  trocar o Gestor de um setor redireciona as pendências sem migração.

## 4. Minhas Avaliações (Gestor)

- `MyEvaluationTask.kind` ganha `"COMPREENSAO_VIDEO"`, com campos extras:
  `comprehensionId`, `videoTitle`, `videoPath`, `answer`, `submittedAtLabel`.
- Quem vê a tarefa (`lib/video-comprehension-scope.ts`, puro, testado):
  - `GESTOR` com `sectorId` igual ao do autor da resposta (autor ≠ avaliador).
  - Fallback quando o autor não tem setor, o setor não tem outro Gestor, ou o
    autor é ele mesmo Gestor: `ADMIN` e Gestores lotados no DHO
    (`canAdministerDho`).
  - Regra no banco: `getMyEvaluationTasks` consulta respostas sem nota e
    filtra com a regra pura, dada a lista de Gestores ativos por setor.
- `countMyPendingEvaluations` soma essas tarefas (mesma regra).
- Card na lista: ícone de vídeo, "Compreensão de vídeo", nome do colaborador,
  título do vídeo, badge "Compreensão". Botão "Avaliar" abre modal com: link
  "Assistir ao vídeo" (abre `videoPath` em nova aba), a resposta em destaque,
  campo de nota 0–10 (`Segmented`/botões 0..10), comentário opcional,
  "Enviar nota".
- `gradeVideoComprehension({ id, grade, comment })`: `evaluations.view`;
  avaliador dentro do escopo acima; `updateMany` com `where: { id, gradedAt:
  null }` — se `count === 0`, "Outro gestor já avaliou". Depois
  `refreshPendingCount()`.

## 5. DHO › Resultados de Avaliações

- `getVideoComprehensionResults(sectors)` → `VideoComprehensionSubject[]`:
  colaborador (id, nome, setor), `count`, `average` (1 casa), `entries[]`
  (id, videoTitle, submittedAtLabel, answer, grade, graderName, gradedAtLabel,
  graderComment). Só `gradedAt ≠ null`. Recorte por setor igual ao catálogo.
- `EvaluationResultsPanel` recebe `comprehension: VideoComprehensionSubject[]`
  e mostra o card sintético "Compreensão de Vídeos" (ícone `MonitorPlay`,
  "N registros · M colaboradores", desabilitado quando vazio) ao lado dos
  instrumentos. Nível 2: `SubjectCard` reaproveitado (com média no subtítulo).
  Nível 3: lista de registros — título do vídeo, data, nota grande (x/10),
  resposta, avaliador e comentário.

## 6. Layout e paginação (Instruções em Vídeo)

- `SectorPage`: `wide` também quando `activeId === "instrucoes-video"`; grade
  `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`. Mesmo na TI.
- `paginate(filteredVideos, page, 16)` em grade e lista; `<Pagination noun="vídeos">`
  no rodapé. `page` volta a 1 ao mudar busca, filtros ou aba. Só na aba de
  Instruções — Coleção e Workshop seguem sem paginação.

## 7. Permissões e segurança

- Progresso e resposta: qualquer usuário logado, só sobre si mesmo (`userId` da
  sessão; nunca do payload).
- Nota: `evaluations.view` + escopo do §4 conferido no servidor.
- DHO: mesma trilha de `getEvaluationResultsCatalog` (`canUseDhoTools`, recorte
  por setor para Gestor de fora do DHO).
- Excluir vídeo ou usuário apaga respostas em cascata (coerente com
  `ContentProgress`).

## 8. Testes

- `video-comprehension-scope.test.ts`: gestor do setor; autor gestor → DHO/Admin;
  sem setor → DHO/Admin; setor sem gestor → DHO/Admin; autor nunca se avalia.
- `paginate` já testado; `typecheck`, `lint`, `test` verdes por commit.

## Fora de escopo

- Rastreio de trechos reproduzidos / percentual assistido (descartado em 17/09).
- Reabrir uma resposta já enviada ou já avaliada.
- Notificação por WhatsApp/push ao Gestor (o contador vermelho é o aviso).
