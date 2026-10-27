# Documentos do colaborador: visor protegido, catálogo novo e o resto da rodada

27 de outubro de 2026

Continua `docs/2026-10-26-dp-vencimentos-e-painel.md`. Esta rodada fez três coisas grandes:
abriu os documentos do Departamento Pessoal para o **Gestor do setor** sem nunca lhe
entregar o arquivo, **trocou as 11 pastas do catálogo por 12 padronizadas**, e paginou
quatro telas. De quebra fechou um furo de segurança que já existia e consertou um bug de
PDF que só aparecia dentro do Next.

## Estado do repositório

**Quatro commits subiram** (`02ecddd`, `1427ef1`, `8b5978a`, `adece40`).

**Falta commitar a correção do PDF**, dois arquivos na árvore de trabalho:

| Arquivo | Estado |
| --- | --- |
| `src/lib/personnel-render.ts` | `M` — o caminho das fontes padrão |
| `src/lib/bundler-safety.test.ts` | `??` — a trava de regressão |

Está verificado (lint, typecheck, 401 unitários, 151 de banco, build) e **esperando o
"pode subir"** — ver [Processo](#processo) no fim.

> Os muitos `D docs/...` no `git status` são deleções que o usuário mandou ignorar. Não
> mexa neles.

## O visor protegido

O Gestor precisava ver os documentos do setor sem poder guardá-los. A resposta não foi
esconder o botão de download — foi **nunca mandar o arquivo**.

```
GET /api/documentos-pessoais/<fileId>?page=N
  → webp de UMA página, com marca d'água, Cache-Control: no-store
  → header X-Total-Pages
```

O PDF é rasterizado no servidor por `pdfjs-dist` + `@napi-rs/canvas`; imagem passa direto
pelo `sharp`. A marca d'água é um SVG composto por cima, inclinado −30°, repetido em
grade, com duas linhas:

```
Visualizado por: <nome de quem está olhando>
CÓPIA NÃO AUTORIZADA · <data>
```

O nome sai da sessão de quem pede, não do dono do documento — uma captura de tela
circulando aponta para quem a tirou. A rota só recebe `user.fullName`, nada mais do
usuário.

**Formatos que o visor abre:** `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.tif`, `.tiff`,
`.gif`. Qualquer outro responde **415** e o visor diz que não dá para abrir ali.

**Abrir arquivo do Office foi descartado** a pedido do usuário. A ideia exigiria
LibreOffice no contêiner; não vale o peso.

### Quem pode o quê

`canReadPersonnelOf(viewerId, papel, ownerId)` em `src/lib/auth/access.ts`:

| Papel | Vê | Baixa |
| --- | --- | --- |
| Admin | tudo | sim |
| Gestor lotado no DHO | tudo | sim |
| Gestor do setor **com** o checkbox marcado | só o próprio setor | **não** |
| Gestor sem o checkbox / qualquer outro papel | nada | — |

O checkbox é `canViewSectorDocs`, no Cadastro de Usuários, e **só aparece quando o papel
é Gestor** — a pergunta não faz sentido para os outros. Desmarcado, o bloco "Documentos"
não é nem renderizado no card do Meu Setor.

**A rota devolve 403 igual para "não existe" e para "não é seu".** Distinguir os dois
contaria ao Gestor que o arquivo existe.

### O furo que já estava aberto

`/uploads/pessoal/...` era alcançável por **qualquer usuário autenticado** que tivesse a
URL. Agora `SENSITIVE_CATEGORIES = new Set(["denuncias", "pessoal"])` em
`src/app/uploads/[...path]/route.ts` governa duas coisas de uma vez: o portão de
`canAdministerDho` e o `no-store`. Isso é anterior a esta rodada e valia para denúncias
também.

## O catálogo novo: 12 pastas

As 11 antigas saíram. `src/lib/personnel-catalog.ts` agora é uma lista plana sob o grupo
`documentos` ("Documentação do colaborador"):

Fotos 3x4 · Carteira de Trabalho · **Exame Médico Admissional** · RG · CPF · Comprovante
de Residência · Título de Eleitor · Cartão NIS/PIS · Certidão de Nascimento ou Casamento ·
Certidão de Nascimento do Filho Menor de 14 anos *(opcional)* · Certidão de Serviço
Militar · Dados Bancários *(opcional)*

Duas propriedades novas em `PersonnelCategory`:

- `validityDays` — o ASO vale **365 dias**, com aviso aos 30 (reusa o
  `EXPIRY_WARNING_DAYS` que já existia);
- `optional` — pasta opcional não conta no progresso e tem estado próprio
  **`"opcional"`**, severidade 0, que nunca pinta o card de vermelho.

As chaves `ctps`, `comprovante-residencia` e `dados-bancarios` foram **reaproveitadas de
propósito**: os arquivos já enviados nessas três continuam aparecendo. As outras chaves
antigas não têm pasta nova, e os arquivos nelas ficam órfãos no banco.

## Painel e paginação

O mosaico do Departamento Pessoal passou a ter **"Completos"** ao lado de "Pendentes", e
**"Em dia" saiu** — somar "em dia" com "completo" era contar a mesma coisa duas vezes.
A ordem é `completo, pendente, vencido, cuidado`.

Paginação onde a lista crescia sem limite:

| Tela | Por página |
| --- | --- |
| Meu Setor | 9 |
| Minhas Avaliações | 10 |
| Resultados de Avaliações | 15 |
| Departamento Pessoal | 15 |

## O resto da rodada

**Meus Chamados** — cada coluna de status mostra **3 cards** e rola; "Resolvido"
desaparece **30 minutos** depois da conclusão.

**Comercial › Vitrine** — a exclusão de documento estava quebrada e voltou a funcionar.

**Meu Setor** — bloco "Documentos" no card, no mesmo padrão visual de Pendências e
Avaliações, abrindo o modal com as pastas e os arquivos.

**WhatsApp (`src/lib/whatsapp/outbox.ts`)** — teto na âncora da fila:

```ts
const anchor = tail._max.sendAfter ?? (sentAt && sentAt <= now ? sentAt : null);
```

Sem isso, uma linha com `sentAt` no futuro empurrava toda a fila para 2030. Foi o que
aconteceu de verdade no banco de desenvolvimento.

**`src/lib/storage/files.ts`** — a regra `document` passou a aceitar `image/jpeg`,
`image/webp`, `image/tiff` e `image/gif`, **nas duas listas**: o conjunto de MIME e o
`RULE_EXTENSIONS`. A extensão é o controle que vale — o MIME vem do remetente.

## O bug do PDF e a trava nova

O usuário abriu um PDF de verdade e viu "Não foi possível abrir o documento". A causa não
era permissão:

**O webpack do Next reescreve `require.resolve` para o ID numérico do módulo.** A linha
compilada era

```js
standardFontDataUrl: path.join(path.dirname(15754), "standard_fonts/")
```

e `path.dirname(15754)` estoura `ERR_INVALID_ARG_TYPE`. **Todo** PDF falhava, para
qualquer usuário. Imagem funcionava porque nem chega no pdfjs.

**Por que passou pela bateria inteira:** o `tsx` dos testes compila para CJS, onde
`require.resolve` é a função de verdade — o teste de PDF passava. E a conferência no
navegador tinha usado PNG.

A correção monta o caminho com `process.cwd()`, que o empacotador não toca. A suposição
está anotada no código como `shortcut:` — vale no `next dev` e na imagem (WORKDIR `/app`);
rever se o deploy passar a rodar de outro diretório.

**`src/lib/bundler-safety.test.ts`** lê o código-fonte de `src/` e proíbe
`require.resolve`. É o terceiro estilo de teste da casa, o mesmo de
`auth/session-usage.test.ts`: nenhum teste de execução pega uma regra sobre o que o
empacotador faz. Foi mutado para confirmar que morde.

## Decisões que valem lembrar

**`src/lib/personnel-visibility.ts` existe por causa do `"use server"`.** Em módulo
`"use server"` todo export vira endpoint, então ele não pode exportar helper puro. As
regras puras (`sectorDocsFlag`, `withoutFilePaths`) nasceram em módulo separado. Importar
`auth/access.ts` de teste unitário também não funciona — ele usa o `cache` do React.

**Admin e DHO baixam; Gestor não.** O Gestor é quem o recurso abriu; Admin e DHO já
tinham o arquivo por outros caminhos, e tirar o download deles só criaria trabalho manual.

**`withoutFilePaths()` existe para o caminho não chegar ao cliente.** O componente recebe
`fileId`, nunca o caminho em disco.

**`bg-background/97` não existe.** O Tailwind não gera essa classe, e o visor ficava
transparente por cima do modal. É `/95`.

**Os testes com relógio falso estavam corrompendo o banco de desenvolvimento.** Um
`WhatsappMessage` com `sentAt = 2030-02-01` nasceu assim. Causa e sintoma foram
corrigidos, mas o padrão pode voltar em qualquer `*.dbtest.ts` que finja a data e escreva
em linha real.

## O que ficou pendente

**Novo nesta rodada:**

1. **A correção do PDF não está commitada.** Dois arquivos, verificados, esperando
   aprovação.
2. **PDF complexo não foi testado.** O arquivo de reprodução tinha duas páginas simples.
   Um DISC com gráficos vetoriais exercita muito mais do pdfjs. Se falhar, o erro aparece
   no log do servidor como `[documentos-pessoais] render:`.
3. **Arquivos órfãos no banco.** As chaves de pasta antigas que não têm equivalente no
   catálogo novo deixaram linhas de `PersonnelFile` sem pasta na tela. Ninguém as apaga.
4. **Não existe registro de quem viu o quê.** A marca d'água responsabiliza *depois* do
   vazamento; um log de acesso responderia *antes*. Foi oferecido e não feito.
5. **`output: "standalone"` no `next.config.mjs`** gera aviso no deploy. Oferecido remover,
   não feito.
6. **`Controller is already closed` em produção** não tem rastro. Um
   `process.on("uncaughtExceptionMonitor")` no `src/instrumentation.ts` capturaria a pilha.
   Oferecido, não feito.
7. **O visor, o modal e o checkbox não têm teste de componente** — a casa não tem como
   rodar um. Ver "Lacunas de teste" abaixo.

**Herdado e ainda em pé:** a corrida ao excluir duas pastas ao mesmo tempo (o item de
maior risco — apaga documentos sem erro nenhum), colaborador sem setor caindo na cor da
Logística, renomear bloco sem teste, os gates de RBAC sem teste, as linhas de `Document`
órfãs em produção, a largura de celular, e a varredura de vencimento que depende de alguém
bater em `/api/cron/evaluations` com o `CRON_SECRET`.

**Migrations:** o `docker-entrypoint.sh` roda `prisma migrate deploy` sob `set -e`. Não é
pendência — roda no deploy.

## Lacunas de teste (por convenção, não por descuido)

- **Route handler e server action não são chamados nos testes.** A razão está escrita em
  `src/lib/sales-funnel/actions.dbtest.ts`: eles começam por `getCurrentUser`, que lê o
  cookie, e num teste de banco não existe requisição. Testa-se **o que decide o
  resultado**, extraído para módulo puro.
- **Permissão tem convenção própria:** `*-scope.dbtest.ts` — agora com
  `personnel-access-scope.dbtest.ts`.
- **Componente não se testa:** nenhum `jsdom`, `testing-library` ou `vitest` no
  `package.json`; zero `.test.tsx`.

Logo: `GET /api/documentos-pessoais/[fileId]`, `deleteSectorDocument` e a janela de 30
minutos dos chamados **não têm teste do handler**. As decisões por trás da rota estão
cobertas; as das outras duas, não.

## O que foi verificado

- `npm run lint` limpo.
- `npm run typecheck` limpo.
- `npm test` — **401 passando**.
- `npm run test:db` — **151 passando**.
- `npm run build` compila, e a saída compilada foi lida para confirmar que o
  `standardFontDataUrl` agora é `path.join(process.cwd(), ...)`.
- Toda regra nova de segurança foi **mutada**: tirar a verificação faz falhar exatamente
  os testes certos.
- No navegador, como Admin: um PDF de duas páginas renderiza com a marca d'água e o rodapé
  "Página 1 de 2", e a seta avança. O arquivo de reprodução foi removido do banco e do
  disco.

## Processo

Regra inviolável do projeto, declarada em 26/10/2026: antes de **qualquer** commit ou
push, rodar a bateria completa (`lint`, `typecheck`, `test`, `test:db`, `build`), corrigir
tudo o que ela revelar, apresentar o resultado consolidado e **esperar aprovação
explícita**. Commit por iniciativa própria, nunca.

## Arquivos

| Arquivo | O quê |
| --- | --- |
| `src/lib/personnel-render.ts` (+ `.test.ts`) | Rasteriza PDF e imagem, compõe a marca d'água |
| `src/lib/bundler-safety.test.ts` | Proíbe `require.resolve` em `src/` |
| `src/app/api/documentos-pessoais/[fileId]/route.ts` | Serve uma página em webp, `no-store` |
| `src/components/sector-overview/personnel-document-viewer.tsx` | O visor em portal, sem download |
| `src/lib/auth/access.ts` | `canReadPersonnelOf` |
| `src/lib/personnel-visibility.ts` (+ `.test.ts`) | Regras puras fora do `"use server"` |
| `src/app/uploads/[...path]/route.ts` | `SENSITIVE_CATEGORIES` |
| `src/lib/personnel-catalog.ts` | As 12 pastas, `optional`, `validityDays` |
| `src/lib/personnel-expiry.ts` | Estado `"opcional"`, `addDays`, `folderStatusLabel` |
| `src/components/hr/personnel-panel.tsx` | "Completos" na grade, paginação em 15 |
| `src/lib/whatsapp/outbox.ts` | Teto na âncora da fila |
| `src/lib/storage/files.ts` | Mais formatos de imagem na regra `document` |
