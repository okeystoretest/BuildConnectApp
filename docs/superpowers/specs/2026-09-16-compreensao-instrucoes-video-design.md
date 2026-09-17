# Instruções em Vídeo: conclusão automática, avaliação de compreensão, 4 colunas e paginação

Data: 2026-09-16.

## Objetivo

1. O botão "Marcar como assistido" sai de **todos** os vídeos (card e lista, em
   toda aba de vídeo). Um vídeo passa a contar como assistido quando o usuário
   **reproduz pelo menos 80 % da duração** — automaticamente.
2. Na ferramenta **Instruções em Vídeo** (todo setor que a tem: setores padrão e
   Retaguarda/TI), ao concluir o vídeo o usuário responde "Você compreendeu a
   atividade? Pode explicar um pouco?" em texto livre. A resposta vai para
   **Minhas Avaliações** dos Gestores do setor do usuário, que dão **nota de 0 a
   10**. Depois da nota, resposta e nota aparecem em **DHO › Resultados de
   Avaliações**, num card próprio.
3. A aba Instruções em Vídeo passa a exibir **4 vídeos por linha** ocupando a
   tela como o Cronograma, com **16 por página** (4 linhas).

Vídeos da Coleção e Workshop (vitrines): perdem o botão e ganham só a
conclusão automática. Sem formulário, sem 4 colunas, sem paginação.

## Contexto que decidiu o desenho

- O player ([video-modal.tsx](../../../src/components/sector/video-modal.tsx))
  usa `<video controls>` nativo. Medir `currentTime / duration` seria burlável
  arrastando a barra; o projeto já enfrentou isso no `GatedVideo` (boas-vindas)
  e resolveu tirando os controles. Aqui os controles ficam — rever um trecho de
  instrução é uso legítimo — e a medida passa a ser **segundos únicos
  efetivamente reproduzidos** (união dos intervalos tocados).
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
  // Progresso parcial do vídeo: união dos trechos reproduzidos
  // ([[início, fim], ...] em segundos) e o total derivado. Guardar só o total
  // deixaria uma segunda sessão contar de novo o que a primeira já contou.
  // `completed` continua sendo o que conta como assistido.
  watchedIntervals Json?
  watchedSeconds   Int?
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

`ContentProgress.completed` passa a ser gravado com `completed: false` enquanto
o progresso é parcial, e `completed: true` ao cruzar 80 %. Leituras que hoje
tratam "existe linha = assistido" passam a olhar `completed` (sector-data,
progress-data, pending-content, hr-history).

## 2. Player e conclusão automática

`VideoModal` ganha rastreio:

- `lib/video-watch.ts` (puro, testado): `addInterval(intervals, start, end)`
  mantém a união de intervalos; `watchedSeconds(intervals)`;
  `isComplete(watched, duration)` = `watched >= 0.8 * duration`.
- No player: a cada `timeupdate`, se o vídeo não estiver pausado e o salto for
  pequeno (< 2 s — seek não conta), acrescenta `[último, atual]`. Ao `seeking`
  o "último" é rearmado.
- A cada ~10 s, ao pausar, terminar, esconder a aba e fechar:
  `saveVideoProgress({ videoId, intervals, duration })` — o cliente manda os
  trechos desta sessão e o **servidor faz a união** com `watchedIntervals`
  gravado, recalcula `watchedSeconds` e marca `completed` quando
  `watchedSeconds >= 0.8 * duration`. No cliente, a soma "crédito anterior +
  sessão" só antecipa a gravação; quem decide é o servidor. A duração vem do
  próprio `<video>` (metadados) — o servidor não tem ffmpeg.
- Concluído uma vez, não volta atrás (não há mais "desmarcar").
- `WatchToggle` some. No card e na lista entra um selo somente-leitura:
  "✓ Assistido" · "Em andamento" (quando há parcial) · nada (não começou). Na
  aba de Instruções, "Responder" quando assistido sem resposta.

`setContentProgress` (marcar/desmarcar) sai com o botão. Documentos não usam
essa action (não há botão de "lido").

## 3. Formulário de compreensão (só Instruções em Vídeo)

- `VideoCard`/`VideoListRow` recebem `comprehension?: boolean` (a página passa
  `true` na aba `instrucoes-video`; a TI também). `VideoItem` ganha
  `comprehension?: "PENDENTE" | "ENVIADA" | "AVALIADA"` (ausente = nunca
  respondeu). Também `watchedSeconds?`.
- Gatilho: no instante em que o servidor confirma a conclusão (80 %), uma
  única vez, e só se `comprehension` estiver ativo e o usuário ainda não tiver
  respondido. Não no `ended`: quem arrasta a barra até o fim sem assistir não
  ganha a pergunta (nem o "assistido"). O player pausa; o formulário aparece
  **dentro do modal do player**, abaixo do vídeo (sem overlay sobre overlay):
  a frase padrão, `Textarea`, "Enviar" e "Responder depois".
- "Responder depois": o card fica com "Responder"; clicar no card reabre o
  player já com o formulário visível (não precisa reassistir).
- `submitVideoComprehension({ videoId, answer })`: usuário logado; vídeo
  existente, `kind ≠ WORKSHOP`, subsetor de setor `PADRAO`; resposta 10–4000
  caracteres; `create` — se já existe, devolve erro "Você já respondeu".
  `revalidatePath` da página do setor.
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

- `video-watch.test.ts`: união de intervalos (sobreposição, contíguos, seek
  para trás), 80 % com arredondamento, duração inválida.
- `video-comprehension-scope.test.ts`: gestor do setor; autor gestor → DHO/Admin;
  sem setor → DHO/Admin; setor sem gestor → DHO/Admin; autor nunca se avalia.
- `paginate` já testado; `typecheck`, `lint`, `test` verdes por commit.

## Fora de escopo

- Transcodificação/duração no servidor; anti-"aba em segundo plano".
- Reabrir uma resposta já enviada ou já avaliada.
- Notificação por WhatsApp/push ao Gestor (o contador vermelho é o aviso).
