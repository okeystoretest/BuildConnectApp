# Avaliação da qualidade do vídeo pelo colaborador — design

Data: 2026-09-22. Aprovado em conversa.

## Objetivo

Depois de enviar a resposta de compreensão, o colaborador avalia **a qualidade
do vídeo** em três critérios — áudio, imagem e clareza das instruções — em
estrelas de 1 a 5, com comentário opcional. Tudo é opcional: dá para pular.

Quem lê isso é o Gestor, na aba "Qualidade dos vídeos" do módulo **Meu Setor**
(spec própria, [2026-09-22-meu-setor-design.md](2026-09-22-meu-setor-design.md)).
Enquanto esse módulo não existir, o dado acumula sem exibição — de propósito:
o painel nasce com histórico real em vez de tela vazia.

Não confundir com a **nota de compreensão**, que é do Gestor sobre o
colaborador. Esta é do colaborador sobre o vídeo, e não entra em média nenhuma
de desempenho.

## Contexto que decidiu o desenho

- O formulário de compreensão vive **dentro** do modal do player
  ([video-modal.tsx](../../../src/components/sector/video-modal.tsx), bloco
  `asking && askable`). A spec de 16/09 registrou o motivo: "sem overlay sobre
  overlay" — dois overlays brigam pelo ESC e pela trava de rolagem do body.
- Ao enviar, `onSubmitted` faz `setAnswered(true)` e `setAsking(false)`, e o
  bloco `answered` mostra a confirmação "Resposta enviada — vídeo concluído".
  **É esse bloco que passa a hospedar a avaliação.**
- `VideoRating` não tem relação com `VideoComprehension`: um vídeo reprovado
  gera nova tentativa de compreensão, mas não uma nova avaliação de qualidade —
  a opinião sobre o vídeo é da pessoa, não da tentativa.

## Decisões

1. **Sem janela nova.** A especificação pede exibição "imediatamente após a
   confirmação e o registro da resposta". Isso é atendido trocando o conteúdo
   do painel que já está aberto, não abrindo um segundo overlay sobre o player.
2. **Estrelas de 1 a 5**, os três critérios opcionais, comentário opcional.
3. **Não marcar nada não grava nada.** Sem linha vazia no banco: "opcional"
   significa ausência, e uma linha com três nulos poluiria a contagem de
   avaliações.
4. **Uma avaliação por pessoa por vídeo.** Reavaliar substitui a anterior.

## 1. Modelo de dados

```prisma
/// Opinião do colaborador SOBRE O VÍDEO (não sobre ele mesmo). Uma por
/// pessoa por vídeo; reavaliar substitui. Nada aqui entra em média de
/// desempenho — quem lê é o Gestor, para saber qual vídeo precisa ser refeito.
model VideoRating {
  id      String @id @default(cuid())
  userId  String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoId String
  video   Video  @relation(fields: [videoId], references: [id], onDelete: Cascade)

  /// 1 a 5. Nulo = o critério não foi avaliado; não conta na média.
  audio   Int?
  image   Int?
  clarity Int?

  comment   String?  @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, videoId])
  @@index([videoId])
}
```

Cada critério entra na sua própria média com o seu próprio denominador: quem
avaliou só o áudio conta na média de áudio e em mais nenhuma.

## 2. Regras puras

Em `src/lib/video-rating.ts`:

- `RATING_MIN = 1`, `RATING_MAX = 5`.
- `RATING_CRITERIA` — os três critérios com seus rótulos em português, para a
  interface e para a aba do Gestor lerem a mesma lista.
- `isEmptyRating({ audio, image, clarity, comment })` — verdadeiro quando os
  três são nulos e o comentário está vazio. É o que decide não gravar.
- `averageOf(values: readonly (number | null)[]): number | null` — média de uma
  casa decimal, **nula** quando não há valor algum. Nulo e zero são coisas
  diferentes: exibir 0,0 para "ninguém avaliou" mentiria sobre o vídeo.

## 3. Interface

`ComprehensionForm` não muda. O bloco `answered` do modal passa a renderizar
`VideoRatingForm` (novo, `src/components/sector/video-rating-form.tsx`):

- A confirmação atual ("Resposta enviada — vídeo concluído...") vira a primeira
  linha do painel, seguida da pergunta "Como foi esse vídeo para você?".
- Três linhas de estrelas (`role="radiogroup"`, cada estrela um `radio` com
  `aria-label` "Áudio: 3 de 5"), um `Textarea` de comentário (máx. 1000) e dois
  botões: "Enviar avaliação" e "Pular".
- "Pular" e o envio bem-sucedido levam ao mesmo estado final: só a confirmação
  da resposta. Avaliar não pode virar obrigação disfarçada.
- Teclado alcança cada estrela; a seleção é visível sem depender de cor.

Só aparece onde a compreensão aparece (`comprehension` verdadeiro): vitrines
não têm pergunta e não têm avaliação.

## 4. Server Action

`submitVideoRating({ videoId, audio, image, clarity, comment })` em
`src/lib/video-rating-actions.ts`:

- Usuário logado; `userId` sempre da sessão, nunca do payload.
- Vídeo existente e com `hasComprehension` — a mesma régua do envio da resposta.
- Cada nota, quando presente, inteiro de 1 a 5; comentário até 1000 caracteres.
- `isEmptyRating` verdadeiro → devolve `{ ok: true }` sem gravar.
- **Exige resposta de compreensão enviada**: sem nenhuma `VideoComprehension`
  daquele usuário para aquele vídeo, recusa. O gatilho é o fim do fluxo de
  resposta, e a action não pode ser chamada fora dele.
- `upsert` pelo unique `[userId, videoId]`.

## 5. Permissões e segurança

Qualquer usuário logado avalia, só sobre si mesmo. A leitura é do Gestor e do
Admin e pertence à spec de Meu Setor. Excluir vídeo ou usuário apaga as
avaliações em cascata, como já acontece com `ContentProgress` e
`VideoComprehension`.

## 6. Testes

`video-rating.test.ts` (puro):

- `isEmptyRating`: três nulos e comentário vazio → verdadeiro; um critério
  preenchido → falso; só comentário → falso; comentário só com espaços → verdadeiro.
- `averageOf`: lista vazia → nulo; só nulos → nulo; `[5, 4]` → 4,5;
  arredondamento a uma casa; nulos no meio não entram no denominador.

`video-rating.dbtest.ts`: grava, reavalia (substitui sem criar segunda linha),
e confirma que a avaliação some ao excluir o vídeo.

## Fora de escopo

- Exibir as avaliações — é a spec de Meu Setor.
- Avaliação de documentos e de conteúdo de vitrine.
- Tornar a avaliação obrigatória.
- Uma avaliação por tentativa de compreensão.
