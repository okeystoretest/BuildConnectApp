# Meu Setor: acompanhamento do setor pelo Gestor — design

Data: 2026-09-22. Aprovado em conversa.

## Objetivo

Um módulo novo, restrito a Gestor e Admin, que mostra como o setor está
consumindo os treinamentos: o avanço de cada colaborador e o do setor inteiro,
com as médias das notas de compreensão. Ganha também a aba que dá destino às
avaliações de qualidade coletadas na spec
[2026-09-22-avaliacao-qualidade-video-design.md](2026-09-22-avaliacao-qualidade-video-design.md).

## A regra da média

Definida pelo usuário em 22/09:

> Some as avaliações e divida pelo total correspondente, **excluindo as
> avaliações reprovadas** — considere exclusivamente as aprovadas. No DHO,
> exiba cada resposta individual com sua respectiva pontuação e calcule a média
> final aplicando a mesma exclusão.

Ou seja: **média = soma das notas ≥ 7 ÷ quantidade de notas ≥ 7**. Tentativas
reprovadas aparecem na listagem, com a nota, mas não entram no cálculo.

**Consequência registrada, e aceita:** a média nunca pode ficar abaixo de 7 —
ela varia só entre 7,0 e 10,0. Quem foi reprovado cinco vezes e passou com 7
exibe a mesma média de quem passou de primeira com 7. Por isso o painel mostra
**"reprovações" como coluna ao lado da média**: depois dessa exclusão, é ali que
mora a informação sobre dificuldade. Sem essa coluna o painel ficaria cego
justamente para o que existe para detectar.

**Sem nenhuma nota aprovada não há média.** A célula mostra `—`, nunca 0,0:
marcar como péssimo quem apenas ainda não foi avaliado seria pior que não
informar.

## Contexto que decidiu o desenho

- Não existe nada de "Meu Setor" hoje: nem rota, nem item de menu, nem
  permissão.
- [permissions.ts](../../../src/lib/permissions.ts) diz: "Qualquer condicional
  de UI deve derivar daqui — nunca comparar Role direto no componente". Logo,
  permissão nova, não `role === "GESTOR"`.
- O progresso tem régua registrada em
  [progress-scope.ts](../../../src/lib/progress-scope.ts): só subsetores
  `PADRAO`; vitrines nunca contam. O painel usa a mesma — se discordar do "Meu
  Progresso" do colaborador, os dois percebem.
- `User.sectorId` é o vínculo com o setor. Quem está com o campo nulo não
  aparece em painel de setor nenhum.
- `getVideoComprehensionResults` hoje calcula a média pela última nota de cada
  vídeo (commit `3069692`). Esta spec substitui essa regra.

## 1. Acesso

- Permissão nova `sector.overview` na matriz, concedida a `GESTOR` e `ADMIN`.
- **Gestor**: vê o setor onde está lotado (`sectorId`), sem seletor. Gestor sem
  `sectorId` vê um aviso explicando que não há setor vinculado ao seu cadastro
  — não uma tela quebrada nem um painel vazio.
- **Admin**: seletor com todos os setores; sem escolha, abre no primeiro.
- O setor efetivo é resolvido **no servidor**. O `sectorId` do Gestor nunca vem
  do cliente: um Gestor que forje o parâmetro continua vendo o setor dele.
- Item "Meu Setor" em `GENERAL_LINKS`, visível só com a permissão.

## 2. Regras puras

Em `src/lib/sector-overview.ts` — o banco entrega linhas, este módulo decide os
números, e os testes rodam sem banco:

```ts
/** Nota aprovada de uma resposta de compreensão. */
export interface GradeRow { userId: string; grade: number }

/** Média das notas APROVADAS. Nula quando não há nenhuma. */
export function approvedAverage(grades: readonly number[]): number | null;

/** Percentual inteiro; total zero devolve 0. */
export function progressPct(done: number, total: number): number;

/** Uma linha da tabela de colaboradores. */
export interface MemberOverview {
  userId: string;
  name: string;
  doneItems: number;
  totalItems: number;
  progress: number;
  average: number | null;
  rejections: number;
  pending: number;
}
```

A exclusão das reprovadas acontece aqui, uma vez: `approvedAverage` recebe só
notas já filtradas por `isPassing`, e a filtragem é responsabilidade da camada
de leitura. Duas implementações da mesma regra é como as duas telas passariam a
discordar de novo.

## 3. Leitura

`src/lib/sector-overview-data.ts`, com `getSectorOverview(sectorId)`:

- Colaboradores ativos com `sectorId` igual ao pedido.
- Conteúdo do setor: vídeos e documentos dos subsetores `PADRAO`
  (`TRACKED_SUBSECTOR`), que é o denominador do progresso.
- `ContentProgress` com `completed: true` desses colaboradores, que é o
  numerador. Reprovar zera `completed`, então um vídeo reprovado volta a contar
  como pendente — coerente com o que o colaborador vê.
- `VideoComprehension` com `gradedAt` preenchido: as de nota ≥ 7 alimentam a
  média; as de nota < 7 alimentam a contagem de reprovações.

## 4. Telas

**Bloco coletivo** — progresso do setor (concluídos ÷ total, somando todos os
colaboradores), média do setor (todas as notas aprovadas do setor, um único
denominador — não a média das médias, que daria peso igual a quem tem uma nota
e a quem tem trinta), número de colaboradores e total de reprovações em aberto.

**Tabela individual** — uma linha por colaborador: nome, progresso, média (`—`
quando não há aprovada), reprovações e pendências. Ordenada por nome;
colaborador sem nenhuma atividade aparece com zeros, não some.

**Aba "Qualidade dos vídeos"** — cada vídeo do setor com as médias de áudio,
imagem e clareza, o número de avaliações e os comentários. Ordenada pela pior
média, porque a pergunta real é "qual vídeo precisa ser refeito?". Vídeo sem
avaliação mostra `—` nos três e fica no fim.

## 5. Mudança no DHO

`getVideoComprehensionResults` troca a média por última nota de cada vídeo pela
média das notas aprovadas, e devolve `null` quando não há nenhuma. O painel
passa a exibir `—` nesse caso. A listagem de registros não muda: já mostra cada
resposta com sua nota e o número da tentativa, que é o que a regra pede.

## 6. Testes

`sector-overview.test.ts` (puro):

- `approvedAverage`: lista vazia → nulo; `[7, 10]` → 8,5; arredondamento a uma
  casa; notas abaixo de 7 nunca chegam aqui, e o teste documenta que o
  resultado é sempre ≥ 7.
- `progressPct`: total zero → 0; 3 de 4 → 75; arredondamento.
- Montagem de `MemberOverview`: colaborador sem nota → `average` nulo e
  `rejections` correto; colaborador sem progresso → zeros, presente na lista.

`sector-overview-data.dbtest.ts`: setor com dois colaboradores, um aprovado e um
reprovado; confere progresso, média, reprovações, e que colaborador de outro
setor não vaza para o painel.

## 7. Permissões e segurança

Toda leitura confere `sector.overview` no servidor. O Gestor é preso ao próprio
`sectorId`, resolvido da sessão. O Admin escolhe, e a escolha é validada contra
a lista de setores existentes. Nenhuma rota devolve dado de setor que o
solicitante não pode ver.

## Fora de escopo

- Exportar o painel (CSV, PDF).
- Série histórica: o painel mostra o estado atual, não a evolução no tempo.
- Ação a partir do painel (cobrar, notificar, reatribuir).
- Gestor ver setor que não é o seu.
- Colaboradores sem `sectorId`, que não pertencem a setor nenhum.
