# Construtor de Formulários do DHO

**Data:** 03/09/2026
**Escopo:** DHO cria formulários dinâmicos; os destinatários respondem em "Minhas
Avaliações"; o DHO lê os resultados num dashboard.

---

## 1. Por que um subsistema separado

O sistema de avaliações atual **não tem onde guardar texto**. `EvaluationAnswer.value`
é um `Int`, e isso não é um detalhe isolado:

- `EvaluationType` tem **uma escala só** (`scaleMax` + `scaleLabels`) aplicada a todas
  as perguntas. Não existe tipo por pergunta.
- `EvaluationQuestion` tem apenas `label`, `helpText`, `order`. Não há tabela de opções.
- `EvaluationKind` é um enum fechado de 5 valores, semeado de `evaluation-catalog.ts`.
  Instrumentos não nascem em runtime.
- O que se calcula em cima disso é estatístico: totais, médias por avaliador,
  consolidação da Eficácia 360° e os quadrantes da Matriz de Decisão.

Os 5 instrumentos são um catálogo psicométrico fechado. Um construtor tipo Google
Forms é outra coisa, que por acaso aparece nas mesmas duas telas. Estender aqueles
modelos obrigaria todo o código de resultado a tratar "resposta sem número", com
risco direto sobre a Matriz de Decisão e a Eficácia.

**Decisão:** modelos novos, lado a lado. Os 5 instrumentos não são tocados.

---

## 2. Modelo de dados

```prisma
enum FormStatus        { RASCUNHO  PUBLICADO  ENCERRADO }
enum FormAssignmentStatus { PENDENTE  CONCLUIDA }
enum FormQuestionKind  {
  TEXTO_CURTO  PARAGRAFO  MULTIPLA_ESCOLHA
  CAIXAS_SELECAO  LISTA_SUSPENSA  ESCALA_LINEAR
}

model Form {
  id          String     @id @default(cuid())
  title       String
  description String?
  status      FormStatus @default(RASCUNHO)

  /// Respostas não guardam autor. Decidido na criação, imutável após publicar.
  anonymous   Boolean    @default(false)

  /// Setor dono do formulário, e a chave do recorte de leitura.
  /// GESTOR grava o próprio setor. ADMIN grava `null` — formulário da empresa,
  /// que NENHUM gestor lê (null não casa com setor nenhum). É intencional: a
  /// pesquisa de clima corporativa é do ADMIN, não de cada gestor.
  ownerSectorId String?
  createdById   String?

  publishedAt DateTime?
  closedAt    DateTime?
  /// Prazo opcional, só informativo — não bloqueia resposta.
  dueAt       DateTime?

  sections    FormSection[]
  assignments FormAssignment[]
  responses   FormResponse[]
}

model FormSection  { id, formId, title, description?, order, questions[] }

model FormQuestion {
  id, sectionId, kind, label, helpText?, required Boolean, order
  /// Só para ESCALA_LINEAR.
  scaleMin Int?  scaleMax Int?  scaleMinLabel String?  scaleMaxLabel String?
  options FormOption[]
}

model FormOption { id, questionId, label, order }

model FormAssignment {
  id, formId, userId, status FormAssignmentStatus, respondedAt DateTime?
  @@unique([formId, userId])
}

model FormResponse {
  id, formId
  /// null quando o formulário é anônimo.
  respondentId String?
  submittedAt  DateTime @default(now())
  answers FormAnswer[]
}

model FormAnswer {
  id, responseId, questionId
  text      String?    // TEXTO_CURTO, PARAGRAFO
  number    Int?       // ESCALA_LINEAR
  optionIds String[]   // MULTIPLA_ESCOLHA, LISTA_SUSPENSA (1) · CAIXAS_SELECAO (N)
  @@unique([responseId, questionId])
}
```

### Duas escolhas dentro do modelo

**`optionIds` é array, não FK.** Caixas de seleção guardam N opções numa resposta só.
Com array, o invariante "uma linha por pergunta" fica cravado no banco
(`@@unique([responseId, questionId])`) e a contagem por opção continua trivial em JS —
a tela de resultados carrega todas as respostas de qualquer forma. O preço é não ter
integridade referencial, resolvido pela regra seguinte.

**Formulário publicado com resposta não muda de estrutura.** Rascunho: edita à
vontade. Publicado e ainda sem resposta: também. Depois da primeira resposta, só
título, descrição e status. Sem isso, apagar uma opção deixaria `optionIds` apontando
para o nada — e, pior, mudaria o significado do que já foi respondido.

---

## 3. Permissões e escopo

Nova permissão **`forms.manage`**, em GESTOR e ADMIN.

| | Criar e publicar | Ler respostas |
|---|---|---|
| ADMIN | qualquer pessoa ou setor | todas |
| GESTOR | só gente do próprio setor | só os formulários do próprio setor |
| COLABORADOR | — | — (só responde o que lhe for atribuído) |

O recorte por setor **não é regra nova**: é a que já governa a mesma tela em
[`rh/page.tsx:36`](../../../src/app/setores/rh/page.tsx) — `sectorScope = isAdmin ? null : [session.sector]`.

Ela é necessária porque a porta do DHO é papel, não lotação:
[`rh/page.tsx:33`](../../../src/app/setores/rh/page.tsx) usa
`if (!canHrAdmin && !canEvaluations) notFound()`, e `evaluations.view` pertence a todo
gestor de todo setor. Sem o escopo, `forms.manage` no gestor viraria acesso geral —
o gestor do Comercial leria a pesquisa de clima da empresa inteira.

**Piso de anonimato.** Num formulário anônimo, agregado sobre um grupo pequeno
identifica quem respondeu. Os gráficos só aparecem a partir de **5 respostas**; abaixo
disso, a tela diz "poucas respostas para exibir o resultado sem identificar quem
respondeu". Sem esse piso, o anônimo é anônimo apenas no schema.

---

## 4. Fluxos

### Criar → publicar

1. DHO › Resultados de Avaliações › bloco **Formulários** › "Criar formulário".
2. Abre `/setores/rh/formularios/[id]` — página cheia, com o formulário nascendo
   `RASCUNHO` com uma seção e uma pergunta.
3. Edita: adiciona, reordena (drag), duplica, remove perguntas; define tipo,
   obrigatoriedade, opções, escala.
4. "Publicar" pede os destinatários (pessoas e/ou setores) e o anonimato.
5. Publicar resolve a seleção para uma lista de usuários e grava **um
   `FormAssignment` por pessoa**. É esse registro, e não a resposta, que responde
   "quem já respondeu" — é o que faz o anônimo funcionar sem contradição.

**Salvar é explícito, não autosave.** O Google Forms salva a cada tecla; aqui isso
seria uma Server Action por caractere. O construtor mantém estado local e grava em
"Salvar" e "Publicar".

### Responder

`MyEvaluationTask` ganha `kind: "FORMULARIO"`, e
[`minhas-avaliacoes`](../../../src/app/minhas-avaliacoes/page.tsx) passa a unir as duas
fontes. O preenchimento é um modal paginado por seção, como o de avaliação já é.

`countMyPendingEvaluations` soma a terceira contagem — **o indicador vermelho da
sidebar passa a cobrir formulários sem nenhuma mudança de UI.**

Submeter, numa transação: cria `FormResponse` + `FormAnswer`s e marca o
`FormAssignment` como `CONCLUIDA`. Reenvio é barrado pelo **status da atribuição** — a
ação só aceita `PENDENTE`, e a transição para `CONCLUIDA` acontece no mesmo commit da
resposta. (O `@@unique([formId, userId])` impede atribuição duplicada, que é outra
coisa; sozinho ele não impediria uma segunda resposta.)

Formulário `ENCERRADO` não aceita resposta nova, mesmo de quem ainda estava `PENDENTE`:
a ação recusa e a tarefa some de "Minhas Avaliações". Encerrar é o que congela o
resultado para leitura.

### Ler resultados

DHO › Resultados › Formulários › abre o formulário → dashboard (seção 5).

---

## 5. Dashboard de respostas

### A paleta foi validada, não escolhida no olho

Os tokens da casa **reprovam como paleta categórica**:

```
#7f5cff (accent) ↔ #3c83f6 (info) : ΔE 2,6 deuteranopia · 11,0 visão normal  → FAIL
```

Violeta e azul são indistinguíveis para daltonismo verde-vermelho e quase
indistinguíveis para todo mundo. Isso derruba o reflexo natural — pintar cada opção de
uma cor. E há um segundo motivo para derrubá-lo: numa pergunta de opção única **a cor
não codificaria nada**, porque a identidade já está no rótulo ao lado da barra.

Onde a cor for de fato necessária (comparar setores lado a lado), este conjunto passa
nos cinco testes, **nos dois temas, com um set só**:

```
#1f9149  #8955e3  #a56d0d  #0086b2
verde    violeta   âmbar    azul
pior par adjacente: ΔE 20,2 (protanopia) · 23,2 (visão normal)
```

Reprodução: `node scripts/validate_palette.js "#1f9149,#8955e3,#a56d0d,#0086b2" --mode dark --surface "#151122"`

### A forma segue o trabalho do dado

| Tipo da pergunta | Forma | Por quê |
|---|---|---|
| Múltipla escolha, caixas, lista suspensa | Barras **horizontais**, uma cor só, ordenadas por volume | Rótulos são texto de comprimento variável; horizontal não corta nem gira |
| Escala linear | Barras verticais **na ordem 1→N**, mais a média em número grande | A ordem carrega significado; ordenar por volume destruiria a leitura |
| Texto e parágrafo | Lista com busca — **não é gráfico** | Não há o que agregar; a resposta é o dado |
| Taxa de resposta | Número grande + medidor | Uma proporção não pede pizza |

**Topo:** respostas recebidas · taxa de resposta · quantos faltam · prazo/status.

**Regras de marca:** valor escrito ao lado de cada barra (identidade nunca depende só
de cor), 2px de folga entre barras, extremidade arredondada ancorada na linha de base,
grade recessiva, tooltip com contagem e percentual, alternância para tabela.

Série única não leva legenda — o título da pergunta já nomeia o que está ali.

**Reaproveita** `KpiTile`, `DistributionPanel` e `Progress`. Sem biblioteca de gráficos
nova.

---

## 6. Telas

| Rota / lugar | O quê |
|---|---|
| DHO › Resultados de Avaliações | Bloco "Formulários": lista com status e nº de respostas + botão Criar |
| `/setores/rh/formularios/[id]` | O construtor, página cheia — herda o RBAC de `/setores/rh` |
| DHO › Resultados › formulário | Dashboard + respostas individuais (se identificado) + quem falta |
| Minhas Avaliações | Modal de preenchimento, paginado por seção |

O construtor em página própria, e não em modal, é o que permite a coluna de perguntas
com barra de ferramentas lateral. Não cabe dentro de uma aba.

O bloco fica dentro de "Resultados de Avaliações" conforme a especificação. Aquela aba
já carrega o catálogo dos 5 instrumentos, o card de atribuição e as rodadas; se ficar
apertada, promover "Formulários" a aba própria é trivial.

**Componente de preenchimento novo**, não uma extensão de `EvaluationFormModal`.
Aquele é uma grade de escala; forçar 6 tipos dentro dele deixaria os dois piores.

---

## 7. Server Actions

| Ação | Guarda |
|---|---|
| `createForm`, `updateFormMeta` | `forms.manage` |
| `upsertQuestion`, `reorderQuestions`, `deleteQuestion`, `upsertOption` | `forms.manage` + dono do form + estrutura destravada |
| `publishForm(destinatários, anonymous)` | `forms.manage` + escopo de setor no GESTOR |
| `closeForm` | `forms.manage` + dono |
| `listMyForms` | `forms.manage`, recortado por `ownerSectorId` |
| `getFormResults(formId)` | `forms.manage` + dono + piso de 5 respostas |
| `submitFormResponse` | atribuição existente e `PENDENTE` para o usuário logado |

Toda guarda é conferida **no servidor**, e a leitura de resultados é recortada na
consulta — não na tela. É a lição do quadro de chamados: filtrar no navegador não
esconde de quem abre o DevTools.

---

## 8. Validação e testes

Infra já existe (`node:test` + `tsx`, `npm test`). Cobrir o que é lógica pura:

- **Validação da submissão:** obrigatório não respondido; valor incompatível com o tipo
  (texto numa escala, duas opções numa múltipla escolha, opção inexistente); escala
  fora de `scaleMin..scaleMax`.
- **Regra de edição pós-publicação:** destravado em rascunho e em publicado sem
  resposta; travado após a primeira.
- **Contagem de pendências** com formulários somados às avaliações.
- **Piso de anonimato:** agregado suprimido abaixo de 5 respostas.
- **Escopo do gestor:** formulário de outro setor não aparece na listagem nem nos
  resultados.

---

## 9. Migration

Puramente **aditiva**: 3 enums e 6 tabelas novas. Nenhuma coluna existente muda, então
não há risco para os 5 instrumentos nem para as telas de resultado atuais. Não precisa
de backfill.

---

## 10. Fora de escopo

Registrado para não voltar como surpresa:

- Os outros 7 tipos do Google Forms (data, horário, classificação, grades, upload).
  As grades dobram a complexidade do construtor e do visualizador.
- Lógica condicional / ramificação entre seções.
- Imagem e vídeo dentro do formulário.
- Exportação CSV dos resultados (fácil de acrescentar depois).
- Edição de resposta já enviada.
- Migrar os 5 instrumentos existentes para este modelo.

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Gestor de outro setor lendo pesquisa de clima | Escopo por `ownerSectorId`, conferido na consulta |
| Anônimo identificável em grupo pequeno | Piso de 5 respostas para exibir agregado |
| `optionIds` órfão após editar formulário publicado | Estrutura travada depois da primeira resposta |
| Aba "Resultados de Avaliações" ficar sobrecarregada | Promover "Formulários" a aba própria (uma linha) |
| Construtor grande demais para um commit | O plano de implementação fatia: schema → ações → construtor → preenchimento → dashboard |
| Usuário desativado deixando pendência eterna | `FormAssignment` de usuário inativo sai da contagem de "quem falta"; `onDelete: Cascade` no usuário limpa as atribuições |
