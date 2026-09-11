# Roteiros do Cronograma pela IA (Gemini)

**Data:** 11/09/2026
**Escopo:** um botão "Roteiro" no card da atividade do Cronograma gera, pelo
Gemini, um roteiro a partir dos campos do card e o guarda no próprio card. A
Retaguarda ganha uma aba, só para Admin, onde vivem a chave da API, o modelo e
as instruções do sistema — uma padrão e uma por marca.

---

## 1. Decisões já tomadas

| Pergunta | Decisão |
|---|---|
| Onde fica o botão | No modal "Detalhes da atividade", ao lado de Editar. O roteiro aparece no mesmo modal, abaixo de Observações. |
| Quem gera / quem lê | Gera quem pode editar o card (`canEditPost`: autor ou Admin). Lê quem enxerga o card. |
| Onde mora a chave | No banco, cifrada. Colada pela aba da Retaguarda. Nunca volta ao navegador. |
| Regerar | Pede confirmação e sobrescreve. O texto também é editável à mão. Sem histórico. |
| Instruções | Uma **Padrão** mais uma por marca (**Okey**, **LOV Club**). Padrão vai sempre primeiro; a da marca vem depois. Card sem marca usa só a Padrão. |
| Modelo | Campo de texto na aba, valor inicial `gemini-2.5-flash`. |
| Quem vê a aba | Só Admin, por uma permissão nova `ai.manage`. |
| Onde a chamada acontece | Server Action. Sem streaming, sem SDK, sem rota `/api`. |

O que ficou de fora, de propósito: histórico de versões do roteiro, instrução
por subsetor, chave em variável de ambiente, chamada pelo navegador.

---

## 2. Modelo de dados

Uma migration: `prisma/migrations/20260911120000_ai_scripts/migration.sql`.

```prisma
// Credencial e modelo da integração com o Gemini. Linha única, como
// PlatformWelcomeVideo.
model AiSettings {
  id           String   @id @default("singleton")
  // Chave cifrada em repouso (AES-256-GCM, chave derivada do SESSION_SECRET).
  // Um dump do banco não entrega a chave da API.
  apiKeyCipher String?
  // Últimos 4 caracteres, em claro. É tudo o que a tela precisa para dizer
  // QUAL chave está salva — a chave inteira nunca volta ao navegador.
  apiKeyHint   String?
  model        String   @default("gemini-2.5-flash")
  updatedAt    DateTime @updatedAt
  updatedById  String?
  updatedBy    User?    @relation("AiSettingsEditor", fields: [updatedById], references: [id], onDelete: SetNull)
}

// Instruções do sistema por escopo. id: "DEFAULT" | "OKEY" | "LOV_CLUB".
// Chave de texto, e não colunas fixas: marca nova vira INSERT, não migration.
model AiInstruction {
  id          String   @id
  body        String
  updatedAt   DateTime @updatedAt
  updatedById String?
  updatedBy   User?    @relation("AiInstructionEditor", fields: [updatedById], references: [id], onDelete: SetNull)
}

model ContentPost {
  // ...campos existentes...

  // Roteiro da atividade: rascunho da IA, acabamento da pessoa. Nulo = nunca
  // gerado. Os três andam juntos — quem escreveu e quando.
  script          String?
  scriptUpdatedAt DateTime?
  scriptById      String?
  scriptBy        User?     @relation("ContentPostScript", fields: [scriptById], references: [id], onDelete: SetNull)
}
```

`User` recebe as três relações inversas (`aiSettingsEdits`, `aiInstructionEdits`,
`contentScripts`). Nada é obrigatório: todo card existente segue válido com
roteiro nulo; a plataforma sem `AiSettings` é a plataforma "sem IA".

---

## 3. Módulos do servidor

Todos em `src/lib/ai/`. Cada um tem um trabalho; três dos quatro são puros e
testados sem rede.

### 3.1 `secret.ts` — cifra da chave

```ts
export function encryptSecret(plain: string): string;   // "v1:<iv>:<tag>:<data>" em base64url
export function decryptSecret(cipher: string): string;  // lança em cifra adulterada/versão desconhecida
```

- AES-256-GCM. Chave: `scryptSync(SESSION_SECRET, "buildconnect:ai-settings", 32)`,
  calculada uma vez por processo. `SESSION_SECRET` já é obrigatório e validado em
  `src/lib/auth/session.ts` — não entra variável nova.
- Trocar o `SESSION_SECRET` invalida a cifra. Consequência aceita: a tela mostra
  "chave salva" mas a geração falha com "Chave da API ilegível — salve-a de
  novo na Retaguarda". Recolar a chave resolve.
- **Teste** (`secret.test.ts`): ida e volta; cifra com um byte trocado lança;
  dois `encrypt` do mesmo texto produzem cifras diferentes (IV aleatório).

### 3.2 `script-prompt.ts` — prompt e instruções

```ts
export interface ScriptSubject {
  title: string; date: string; time: string;
  funnel: FunnelStage; formats: readonly ContentFormat[]; formatOther?: string;
  status: ContentStatus; brand?: ContentBrand; platforms: readonly ContentPlatform[];
  notes?: string; ownerName?: string;
}
export function buildScriptPrompt(subject: ScriptSubject): string;
export function composeSystemInstruction(defaultBody: string | null, brandBody: string | null): string;
export const FALLBACK_INSTRUCTION: string;
```

- `buildScriptPrompt` monta um bloco em português, uma linha por campo, usando
  os rótulos de `src/lib/funnel.ts` (`FUNNEL[].label`, `formatLabel`,
  `PLATFORM[].label`, `BRAND[].label`, `STATUS_LABEL`). Campo vazio **não vira
  linha** — não existe "Marca: não informada". Data sai como `dd/mm/aaaa às hh:mm`.
- `composeSystemInstruction` concatena Padrão e marca com uma linha em branco
  entre elas. Se as duas estiverem vazias, devolve `FALLBACK_INSTRUCTION`
  ("Você é roteirista de conteúdo para redes sociais. Escreva em português do
  Brasil. Responda apenas com o roteiro."), para a funcionalidade funcionar no
  dia em que a chave for colada, antes de alguém escrever instrução.
- **Teste** (`script-prompt.test.ts`): card completo, card mínimo (só
  obrigatórios — sem linha de marca, rede, observação), card com formato OUTRO
  (usa o texto livre), composição padrão+marca, só padrão, nenhuma → fallback.

### 3.3 `gemini.ts` — a chamada

```ts
export interface GeminiRequest { apiKey: string; model: string; systemInstruction: string; prompt: string; }
export type GeminiResult = { ok: true; text: string } | { ok: false; error: string };
export function generateText(req: GeminiRequest, fetchImpl?: typeof fetch): Promise<GeminiResult>;
```

- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
  header `x-goog-api-key`, corpo com `systemInstruction.parts[0].text`,
  `contents[0].parts[0].text`, `generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }`.
  `AbortSignal.timeout(45_000)`.
- Resposta: concatena `candidates[0].content.parts[].text`. `text` vazio,
  `promptFeedback.blockReason` ou `finishReason === "SAFETY"` → erro "O Gemini
  recusou gerar este roteiro. Ajuste as observações ou as instruções."
- Tradução de erro — a tela nunca vê corpo cru do Google:

  | Situação | Mensagem |
  |---|---|
  | 400 / 401 / 403 | Chave da API inválida ou sem acesso ao modelo. |
  | 404 | O modelo "{model}" não existe. Confira o nome na Retaguarda. |
  | 429 | Cota do Gemini esgotada. Tente novamente em alguns minutos. |
  | 5xx, timeout, rede | O Gemini não respondeu. Tente novamente. |

- Sem dependência nova: `fetch` nativo. O `package.json` não muda.
- **Teste** (`gemini.test.ts`): `fetchImpl` falso devolvendo cada status acima
  e o corpo feliz; confere a mensagem e que a chave foi para o header, não para
  a URL.

### 3.4 `settings-data.ts` — leitura para a tela

```ts
export interface AiSettingsView {
  hasKey: boolean; keyHint: string | null; model: string;
  instructions: Record<"DEFAULT" | "OKEY" | "LOV_CLUB", { body: string; updatedAt: string | null; updatedByName: string | null }>;
}
export async function getAiSettingsView(): Promise<AiSettingsView>;
export async function isAiReady(): Promise<boolean>;         // há apiKeyCipher?
export async function loadAiRuntime(): Promise<{ apiKey: string; model: string; instructions: ... } | null>; // decifra — só a action de gerar chama
```

`getAiSettingsView` **não tem caminho de código que devolva `apiKeyCipher` ou a
chave em claro**. Quem decifra é `loadAiRuntime`, chamado só por
`generatePostScript` e `testAiConnection`.

---

## 4. Server Actions

### 4.1 Permissão nova

`"ai.manage"` no tipo `Permission` (`src/types/index.ts`) e só na linha `ADMIN`
da matriz (`src/lib/permissions.ts`). O teste `permissions.test.ts` ganha o caso.

### 4.2 `src/lib/ai/settings-actions.ts` (`"use server"`, exige `ai.manage`)

- `saveAiCredentials({ apiKey?: string; model: string })` — `apiKey` vazio ou
  ausente significa **manter a atual**; com valor, cifra e grava `apiKeyHint`
  (últimos 4). `model` obrigatório, `trim`, máx. 80 caracteres, sem espaços.
  Grava `updatedById`. `revalidatePath("/setores/ti")`.
- `removeAiKey()` — zera `apiKeyCipher` e `apiKeyHint`. O botão "Roteiro" some
  do Cronograma em toda a plataforma; roteiros já salvos permanecem.
- `saveAiInstruction({ scope: "DEFAULT" | "OKEY" | "LOV_CLUB"; body: string })` —
  `body` até 8000 caracteres; vazio apaga a linha (upsert/delete).
- `testAiConnection()` — `loadAiRuntime()`; sem chave → erro "Salve a chave
  antes de testar"; com chave, `generateText` com prompt "Responda apenas OK."
  Devolve `{ ok, error?, model }`. Passa pelo mesmo rate limit da geração.

### 4.3 Guardas extraídos: `src/lib/cronograma-guards.ts`

`requireUser`, `requireAuthor`, `requireScope` e `revalidateScope` saem de
`cronograma-actions.ts` para um módulo **sem** `"use server"` — exportá-los do
arquivo atual os transformaria em endpoints. `cronograma-actions.ts` passa a
importá-los; comportamento idêntico, nenhum teste muda.

### 4.4 `src/lib/ai/script-actions.ts` (`"use server"`)

- `generatePostScript({ id, slug })`:
  1. `requireUser` → `requireScope(slug)` → `requireAuthor(id, scope.id)`. Mesmas
     mensagens do Editar.
  2. `consume("ai-script:user:" + user.id, 20, 60 * 60 * 1000)` — **20 gerações
     por hora por pessoa**. Estourou → "Limite de roteiros por hora atingido.
     Tente em {n} minutos."
  3. `loadAiRuntime()`; nulo → "A IA não está configurada. Peça à Retaguarda."
     Cifra ilegível → a mensagem da seção 3.1.
  4. Lê o card (mesmos campos do `select` de `cronograma-data.ts` + `owner`),
     monta `ScriptSubject`, `composeSystemInstruction(DEFAULT, marca)`,
     `generateText`.
  5. Erro do Gemini → devolve a mensagem traduzida **sem tocar no banco**: o
     roteiro anterior, se havia, continua lá.
  6. Sucesso → `update { script, scriptUpdatedAt: now, scriptById: user.id }`,
     `revalidateScope`, devolve `{ ok: true }`. O texto chega à tela pelo
     `router.refresh()` do modal, que relê `data.posts`.
- `savePostScript({ id, slug, body })` — a edição à mão. Mesmos guardas, sem
  rate limit, sem IA. `body` até 12000 caracteres; vazio apaga o roteiro (os
  três campos vão a nulo).

---

## 5. Aba na Retaguarda

### 5.1 Dados

`src/app/setores/ti/page.tsx`: quando `can(session.role, "ai.manage")`, chama
`getAiSettingsView()` no `Promise.all` já existente e passa `aiSettings` ao
`ItSectorView`; caso contrário passa `null`. Quem não é Admin não recebe nem o
`keyHint`.

### 5.2 Aba

Em `it-sector-view.tsx`, `TABS` ganha `{ id: "ia", label: "Inteligência Artificial" }`
no fim. A lista passada ao `<Tabs>` filtra essa aba quando `aiSettings` é nulo
ou `!can("ai.manage")` — a aba não existe para Colaborador e Gestor.

### 5.3 Painel — `src/components/it/ai-settings-panel.tsx`

Dois cartões, na linguagem visual dos outros painéis (`rounded-xl border
border-border bg-surface`):

**Conexão**
- "Chave da API": `<input type="password">`, `autoComplete="off"`. Com chave
  salva, o placeholder é `••••••••••••{hint}` e o rótulo de ajuda diz "Deixe em
  branco para manter a chave atual".
- "Modelo": texto, valor inicial vindo do servidor.
- Botões: `Remover chave` (secundário, só quando `hasKey`, com confirmação
  inline), `Testar conexão` (secundário, só quando `hasKey`) e `Salvar`.
- Resultado do teste numa faixa abaixo: verde "Conexão OK · {model}" ou vermelha
  com a mensagem traduzida.

**Instruções do sistema**
- Três sub-abas (Padrão / Okey / LOV Club) trocando um `<textarea>` de 12
  linhas. Contador `n / 8000`. Linha "Salvo por {nome} · {data}" quando houver.
- Um `Salvar` por sub-aba; salva só o escopo aberto. `useTransition` +
  `router.refresh()`, como os outros formulários.
- Texto de ajuda fixo no topo: "A instrução Padrão vale para todo roteiro. A da
  marca é acrescentada depois dela quando o card tem marca."

---

## 6. O botão no Cronograma

### 6.1 Dados

- `CronogramaData` ganha `aiReady: boolean` — `getCronogramaData` chama
  `isAiReady()` junto das outras consultas.
- `ContentPostItem` ganha `script?: string`, `scriptUpdatedAt?: string` (ISO) e
  `scriptAuthorName?: string`. O `select` e o `toItem` de `cronograma-data.ts`
  passam a carregá-los (`scriptBy: { select: { fullName } }`).
- Como o `CronogramaPanel` é montado num lugar só (`sector-page.tsx`), Vendas,
  Marketing e Criação recebem tudo juntos. `aiReady` desce
  `CronogramaPanel → PostDetailsModal → PostScript`.

### 6.2 `src/components/cronograma/post-script.tsx`

Seção renderizada em `post-details-modal.tsx` logo abaixo de Observações, e o
botão na barra de ações. Estados:

| `aiReady` | `post.script` | `post.canEdit` | O que aparece |
|---|---|---|---|
| false | null | qualquer | Nada. Nem botão, nem seção. |
| false | texto | qualquer | Seção com o texto (o que foi salvo continua legível). Sem botões de IA; `Editar` só se `canEdit`. |
| true | null | false | Nada. |
| true | null | true | Botão `[✨ Roteiro]` na barra de ações, entre Fechar e Editar. |
| true | texto | false | Seção com o texto e "Gerado por {nome} · dd/mm hh:mm". |
| true | texto | true | Seção com o texto, rodapé e dois botões discretos: `Editar` e `Gerar novamente`. |

- **Gerando**: o botão vira `[⟳ Gerando roteiro…]`; Editar/Excluir/Fechar
  desabilitam (`pending`). Termina com `router.refresh()`.
- **Gerar novamente**: confirmação inline no mesmo desenho do Excluir — "Gerar
  novamente substitui o roteiro atual. Continuar?" · `Manter` / `Gerar`.
- **Editar**: a seção vira `<textarea>` com o texto, `Salvar` / `Cancelar`.
  Salvar chama `savePostScript`; apagar tudo e salvar remove o roteiro.
- **Erro**: faixa vermelha dentro da seção com a mensagem da action. O texto
  anterior fica na tela.
- Exibição: `whitespace-pre-wrap break-words`, como Observações. O modal já
  rola por dentro (`max-h` em `ui/modal.tsx`), então roteiro longo não estoura.

---

## 7. Segurança, em resumo

- A chave entra por Server Action de Admin, é cifrada antes de tocar o banco e
  só é decifrada dentro de `loadAiRuntime`, no servidor, na hora de chamar o
  Gemini. Nenhum tipo exportado para componente contém a chave ou a cifra.
- A chamada ao Google leva a chave no header, nunca na URL (não cai em log de
  proxy).
- Gerar exige autoria do card (ou Admin) e respeita 20/hora por pessoa.
- Mensagens de erro são traduzidas; corpo de resposta do Google vai para
  `console.error` com o prefixo `[gemini]`, não para a tela.
- A chave que passou pelo chat da sessão em que este spec nasceu deve ser
  **rotacionada** no AI Studio depois que a integração estiver validada.

---

## 8. Arquivos

**Novos**
- `prisma/migrations/20260911120000_ai_scripts/migration.sql`
- `src/lib/ai/secret.ts` + `secret.test.ts`
- `src/lib/ai/script-prompt.ts` + `script-prompt.test.ts`
- `src/lib/ai/gemini.ts` + `gemini.test.ts`
- `src/lib/ai/settings-data.ts`
- `src/lib/ai/settings-actions.ts`
- `src/lib/ai/script-actions.ts`
- `src/lib/cronograma-guards.ts`
- `src/components/it/ai-settings-panel.tsx`
- `src/components/cronograma/post-script.tsx`

**Alterados**
- `prisma/schema.prisma`
- `src/types/index.ts` (Permission), `src/lib/permissions.ts` (+ teste)
- `src/types/cronograma.ts`
- `src/lib/cronograma-data.ts`, `src/lib/cronograma-actions.ts` (importa os guardas)
- `src/app/setores/ti/page.tsx`, `src/components/it/it-sector-view.tsx`
- `src/components/cronograma/cronograma-panel.tsx`, `post-details-modal.tsx`
- `.env.example` (um comentário dizendo que a chave do Gemini fica no banco, pela Retaguarda — não há variável)

---

## 9. Verificação

- `npm test` — cifra, prompt, tradução de erro, permissão.
- `npm run typecheck` e `npm run lint` limpos.
- `npx prisma migrate deploy` no servidor aplica a migration sem tocar linha
  existente.
- Ponta a ponta, em produção: entrar como Admin → Retaguarda → aba
  "Inteligência Artificial" → colar a chave, `Salvar`, `Testar conexão` → verde.
  Escrever a instrução Padrão. Ir a Marketing → Cronograma → abrir um card
  próprio → `Roteiro` → texto aparece e persiste ao fechar e reabrir. Entrar
  como Colaborador de outro setor que enxerga o card público → vê o roteiro,
  não vê o botão. `Remover chave` na Retaguarda → o botão some, o roteiro fica.
