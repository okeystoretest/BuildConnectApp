# Reprovação na compreensão de vídeo: novas tentativas, avisos ao gestor e sinalização em Meu Progresso — design

Data: 2026-09-22. Aprovado em conversa.

## Objetivo

Fechar o ciclo da avaliação de compreensão das Instruções em Vídeo, que hoje
termina na nota. Passa a existir **reprovação**: nota abaixo de 7 devolve o
vídeo ao colaborador, que reassiste e responde de novo, quantas vezes forem
necessárias. O gestor é avisado quando a fila acumula; o colaborador é avisado
quando é reprovado; e "Meu Progresso" deixa de ser uma lista morta — dá para
abrir o conteúdo ali mesmo, e o que foi reprovado se destaca.

Isto **inverte uma decisão** da spec de 16/09, que listava "reabrir uma resposta
já enviada ou já avaliada" como fora de escopo. A inversão é deliberada: sem
reabrir, não há reprovação.

## Contexto que decidiu o desenho

- `VideoComprehension` tem `@@unique([userId, videoId])` — uma resposta por
  vídeo, para sempre. É esse índice que impede a reprovação.
- `ContentProgress.completed` é lido por `sector-data`, `progress-page-data`,
  `pending-content` e o histórico do DHO. Mudar sua semântica atinge as quatro.
- `submitVideoComprehension` exige `ContentProgress.endedAt`. Depois de uma
  reprovação o `endedAt` continua gravado — sem zerá-lo, o colaborador
  responderia de novo **sem reassistir**, que é o oposto do pedido.
- A tela "Meu Progresso" ([progress-page-data.ts](../../../src/lib/progress-page-data.ts))
  só lista o que **não** está concluído. Um vídeo respondido some da lista. Não
  há, hoje, onde pintar de amarelo.
- `PendingItem` ([pending-content.ts](../../../src/lib/pending-content.ts)) carrega
  só `{id, kind, title, sector, meta}` — nada que permita reproduzir o vídeo.
- O `VideoModal` é instanciado **dentro de cada `VideoCard`**, não no topo da
  página. Abrir um vídeo a partir de outra tela exige um dono novo para o modal.
- Já existe cron protegido por token
  ([api/cron/evaluations](../../../src/app/api/cron/evaluations/route.ts)), no
  padrão "varredura agendada + mesma varredura sob demanda". O escape por tempo
  entra ali; não há subsistema novo.
- `countPendingComprehensionTasks` já devolve o tamanho da fila de um gestor —
  é a contagem que o gatilho dos 5 precisa.

## Decisões

1. **Nota de 1 a 10**, aprovação a partir de **7**. A escala era 0–10; o 0 deixa
   de ser aceito em envios novos. Notas 0 já gravadas continuam legíveis.
2. **Sem teto de tentativas.** O colaborador refaz quantas vezes precisar.
3. **Reprovar devolve o vídeo a pendente.** `completed` volta a `false` e o
   percentual do colaborador cai até ele ser aprovado. "Concluído" passa a
   significar "aprovado".
4. **Só o sino.** Nenhum aviso de reprovação por WhatsApp.

## 1. Modelo de dados

`VideoComprehension` deixa de ser "a resposta" e passa a ser "uma tentativa".

```prisma
model VideoComprehension {
  // ...campos atuais...

  /** 1 para a primeira resposta; +1 a cada reprovação. */
  attempt Int @default(1)

  /** Escape por tempo: o gestor já foi avisado desta resposta parada. */
  staleNotifiedAt DateTime?

  @@unique([userId, videoId, attempt])   // era @@unique([userId, videoId])
  @@index([userId, videoId])
}

/** Gatilho dos 5: lembra o último patamar avisado, para não repetir. */
model GraderAlertState {
  graderId          String   @id
  grader            User     @relation(fields: [graderId], references: [id], onDelete: Cascade)
  lastNotifiedCount Int      @default(0)
  lastNotifiedAt    DateTime @default(now())
}
```

`NotificationKind` ganha **`TREINAMENTO`** (aviso de reprovação ao colaborador).
`CONTEUDO` significa "material novo" e mentiria no sino. O aviso ao gestor reusa
`AVALIACAO`, que já existe.

### Migration (expand/contract, em passos reversíveis)

1. `ALTER TABLE ... ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1` e
   `ADD COLUMN staleNotifiedAt TIMESTAMP` — toda linha existente já é a
   tentativa 1; não há backfill a escrever.
2. `CREATE UNIQUE INDEX` novo em `(userId, videoId, attempt)`.
3. `DROP INDEX` do unique antigo `(userId, videoId)`.
4. `CREATE TABLE GraderAlertState`; `ALTER TYPE NotificationKind ADD VALUE
   'TREINAMENTO'` (aditivo).

Nenhum dado se perde. Os passos 2 e 3 são separados de propósito: entre eles o
banco aceita as duas leituras, e uma reversão não deixa a tabela sem chave.

Constantes em [video-comprehension.ts](../../../src/lib/video-comprehension.ts):
`COMPREHENSION_GRADE_MIN = 1`, `COMPREHENSION_PASS_MIN = 7`, e as funções puras
`isPassing(grade)` e `rejectionLevel(count): 0 | 1 | 2` (2 satura: a terceira
reprovação e as seguintes têm o mesmo tratamento da segunda).

## 2. Ciclo de vida

| Evento | Efeito |
| --- | --- |
| Envio | cria a tentativa `N+1`; recusa se já existe tentativa sem nota; `completed: true` |
| Nota ≥ 7 | nada muda — segue concluído |
| Nota < 7 | transação: `completed: false`, `completedAt: null`, `endedAt: null`; grava a notificação ao colaborador |

`submitVideoComprehension` passa a calcular `attempt` como
`max(attempt) + 1` dentro da transação e substitui a guarda de `P2002` por uma
verificação explícita: havendo tentativa com `gradedAt: null`, devolve
*"Sua resposta anterior ainda está em avaliação."* O `create` continua protegido
pelo unique novo — se dois envios correrem juntos, o segundo falha e vira a
mesma mensagem.

`gradeVideoComprehension` passa a aceitar `1..10`, e quando a nota reprova faz,
na mesma transação do `updateMany`, o `contentProgress.update` que devolve o
vídeo a pendente. O aviso ao colaborador é gravado **depois do commit**, pelo
módulo de notificações, que nunca lança.

## 3. Avisos ao gestor

Lógica pura em `src/lib/video-comprehension-alerts.ts` — o banco entrega os
números, a decisão é testada sem ele (mesmo desenho de
[video-comprehension-scope.ts](../../../src/lib/video-comprehension-scope.ts)).

- **Gatilho dos 5**: depois de cada envio, conta a fila pendente do gestor
  (`countPendingComprehensionTasks`). Avisa quando a fila atinge um múltiplo de
  5 **e** esse patamar é maior que `lastNotifiedCount`. Assim um salto de 4 para
  6 não perde o gatilho, e avaliar respostas (que encolhe a fila) não faz o
  aviso repetir quando ela volta a crescer. `lastNotifiedCount` recua junto com
  a fila quando ela cai abaixo do patamar avisado.
- **Escape por tempo**: `sweepStaleComprehensions()` pendurada na rota de cron
  existente, ao lado de `sweepAvailability`. Resposta sem nota há mais de
  **3 dias** gera um aviso ao gestor e marca `staleNotifiedAt` — uma vez por
  resposta. Resolve o caso de quem responde três vídeos e para: sem isso, o
  gatilho dos 5 nunca dispara e a resposta fica órfã.
- O contador vermelho de Minhas Avaliações continua como está. Estes avisos
  somam, não substituem.

## 4. Aviso ao colaborador e deep-link

- Texto: **"Opa! Não foi dessa vez — assista ao vídeo *{título}* novamente."**
  `kind: TREINAMENTO`, alvo individual.
- `href`: `/setores/{slug}?aba=instrucoes-video&video={id}&assistir=1`.
- `sector-page` lê `video` e `assistir` dos search params e marca o card
  correspondente para abrir já reproduzindo. Como o modal vive dentro do
  `VideoCard`, o que desce é um `autoOpenId`, comparado ao `video.id`.
- `VideoModal` ganha `autoPlay?: boolean`: no mount chama `play()` e **ignora a
  rejeição da promise**. Navegadores bloqueiam reprodução com som sem gesto do
  usuário, e o gesto do clique na notificação não sobrevive à navegação. Quando
  o navegador recusa, o vídeo fica carregado com os controles nativos à vista.
  Nunca reproduz mudo — um treinamento sem áudio é pior que um play manual.
- Depois de abrir, os params saem da URL com `replaceState`, para o F5 não
  reabrir o player.

## 5. Meu Progresso

`PendingItem` passa a carregar `filePath`, `thumbnailPath`, `transcriptText`,
`subsectorSlug`, `ended`, `comprehension` e `rejections` (contagem de tentativas
com nota abaixo de 7 naquele vídeo).

- **Clicar executa.** A linha vira botão: vídeo abre o `VideoModal` na própria
  tela — com a pergunta de compreensão ativa quando `hasComprehension` vale —;
  documento abre em nova aba, o mesmo comportamento da vitrine. O modal ganha um
  dono novo, um client component da página de progresso, já que na tela de setor
  quem o instancia é o card.
- **Sinalização**, sempre cor **e** ícone **e** texto (cor sozinha não sinaliza —
  WCAG 1.4.1):
  - `rejections === 1`: fundo e borda âmbar, ícone de alerta, selo **"Refazer"**.
  - `rejections >= 2`: tom mais forte, mesmo ícone e selo, e a mensagem abaixo
    do arquivo: *"Que tal rever com calma? Assista ao vídeo de novo e responda."*
- **Grupo "Refazer" no topo**, separado das demais pendências. Um vídeo a
  refazer perdido no meio de quarenta pendências não é sinalização.

Efeito colateral aceito e consciente: o percentual do colaborador cai quando ele
é reprovado. O grupo "Refazer" existe para que a queda seja legível em vez de
misteriosa.

## 6. DHO › Resultados de Treinamentos

- `getVideoComprehensionResults` passa a trazer `videoId` e `attempt` e lista
  **todas as tentativas avaliadas**, numeradas ("tentativa 2 de 3").
- A média do colaborador usa **a última nota de cada vídeo**, não todas as
  tentativas. Somar as reprovadas puniria duas vezes quem foi reprovado e depois
  aprovado — a média deixaria de medir compreensão e passaria a medir histórico.
- `count` continua sendo o número de registros exibidos.

## 7. Permissões e segurança

Inalteradas. A nota continua exigindo `evaluations.view` mais o escopo de
`resolveGraders`, conferido no servidor. O envio continua agindo só sobre o
`userId` da sessão. A rota de cron segue protegida pelo `CRON_SECRET` com
comparação em tempo constante.

## 8. Testes

- `video-comprehension.test.ts` (novo): `isPassing` nas bordas 6/7/10;
  `rejectionLevel` em 0, 1, 2 e 5 (satura em 2).
- `video-comprehension-alerts.test.ts` (novo): dispara em 5; não repete no mesmo
  patamar; dispara de novo em 10; salto de 4 para 6 dispara; fila que encolhe
  abaixo do patamar rearma; resposta parada há mais de 3 dias entra na varredura
  uma vez só.
- `video-comprehension-scope.test.ts`: segue válido, sem mudança.
- `comprehension-cycle.dbtest.ts` (novo): responder → reprovar → o vídeo volta a
  pendente com `endedAt` nulo → reassistir → responder de novo cria a tentativa
  2 → aprovar conclui; e a guarda de tentativa pendente.
- `typecheck`, `lint` e `test` verdes por commit, como no resto do repo.

## Fases de entrega

1. **Fase 1** — modelo, migration, ciclo de reprovação, avisos (gestor e
   colaborador) e deep-link com play. Entrega o fluxo inteiro: o colaborador
   chega ao vídeo pela notificação.
2. **Fase 2** — Meu Progresso interativo: clique para executar, grupo "Refazer",
   sinalização. Conveniência sobre um fluxo que já funciona.

## Fora de escopo

- **WhatsApp na reprovação** — decisão do usuário: só o sino.
- **Teto de tentativas** — decisão do usuário: refaz quantas vezes precisar.
- Escalar para o DHO após N reprovações.
- Reprovação de documentos (só vídeo tem pergunta de compreensão).
- Editar uma resposta já enviada — continua valendo: corrige-se respondendo de
  novo, não editando.
