# Build.Connect — contexto completo para continuar o trabalho

> Passagem de contexto para uma nova sessão. Estado em **08/09/2026**,
> `main` em **`2c39f4a`**, working tree limpa, tudo empurrado para o GitHub.
>
> Leia a seção 10 primeiro se quiser saber apenas **o que fazer agora**.

---

## 1. O projeto

Intranet corporativa: setores com conteúdo (vídeos, documentos, links),
chamados de TI e de Motoristas com rastreio GPS, avaliações 360, formulários
internos, canal anônimo de denúncias e notificações por WhatsApp.

| Item | Valor |
|---|---|
| Stack | Next.js **15.5.25** (App Router), React **18.3.1**, TypeScript 5, Tailwind 3 |
| ORM | Prisma **6.19.3** + PostgreSQL |
| Validação | Zod **3.25.76** |
| WhatsApp | `baileys` **6.7.24** (cliente **não oficial** da Meta) |
| Imagens | `sharp` **0.35.4** |
| Senhas | `bcryptjs` 2.4.3, cost 12 |
| Auth | **Própria.** Sem Auth.js / NextAuth |
| Repositório | `github.com/okeystoretest/BuildConnectApp` |
| Domínio | `https://buildconnectapp.com.br` |

### Fluxo de trabalho combinado com o dono

- **Commit e push direto no `main`.** Sem branch, sem PR. O deploy sai do `main`
  e o sistema ainda não tem usuários reais, então ele testa em produção.
  Revisar essa combinação quando entrar em uso de verdade.
- `git push origin main` funciona. Um `git push -u origin <branch-nova>` chegou
  a ser **bloqueado pelo classificador de permissões** do modo automático — se
  acontecer, peça ao dono para publicar pela interface do VS Code.
- O dono responde em português e acompanha o raciocínio técnico de perto.
  Prints de tela dele foram o que mais acelerou os diagnósticos: peça quando
  precisar.

### Convenções do código — respeite-as

- **Comentários em português explicando o PORQUÊ**, não o quê. Densos,
  narrativos, frequentemente citando o bug que motivou a linha. Este é o traço
  mais forte do repositório; código novo sem isso destoa.
- **Mensagens de commit no mesmo tom**: título curto e afirmativo, corpo
  narrando o problema e a decisão. Exemplos reais no `git log`.
- **Regra pura + teste ao lado.** Padrão de `src/lib/forms/rules.ts` +
  `rules.test.ts`. Server Action fina delegando a um core testável:
  `forms/actions.ts` → `forms/core.ts` (que recebe o ator explicitamente e tem
  `core.dbtest.ts`).
- Imports com alias `@/`.

### Comandos

```bash
npm run dev          # desenvolvimento
npm test             # 106 testes, tsx, SEM banco
npm run test:db      # exige Postgres acessível
npx tsc --noEmit     # typecheck
npx eslint .         # lint
npm run build        # build de produção
```

**Antes de qualquer commit, rode os quatro últimos.** Todos passando em
`2c39f4a`: tsc 0, eslint 0, **106/106 testes**, build 0.

---

## 2. Mapa da aplicação

### Páginas (App Router, `src/app/`)

```
/                              page.tsx
/login                         login/page.tsx
/chamados                      chamados/page.tsx
/minhas-avaliacoes             minhas-avaliacoes/page.tsx
/progresso                     progresso/page.tsx
/setores/[slug]                setores/[slug]/page.tsx
/setores/rh                    setores/rh/page.tsx
/setores/ti                    setores/ti/page.tsx
/setores/motoristas            setores/motoristas/page.tsx
/setores/rh/formularios/[id]   setores/rh/formularios/[id]/page.tsx
```

### Route Handlers

| Rota | Auth |
|---|---|
| `src/app/api/health/route.ts` | Pública (fora do matcher). `SELECT 1` |
| `src/app/api/cron/evaluations/route.ts` | `CRON_SECRET` via Bearer, `timingSafeEqual` |
| `src/app/api/avaliacoes/pendentes/route.ts` | `getCurrentUser()` |
| `src/app/api/chamados/board/route.ts` | `getCurrentUser()` + RBAC por subsetor |
| `src/app/api/chamados/[id]/tracking/route.ts` | `getCurrentUser()` + dono/motorista/quadro |
| `src/app/uploads/[...path]/route.ts` | `getCurrentUser()` + `reports.manage` para `denuncias` |

### Server Actions (20 arquivos com `"use server"` em `src/lib/`)

`auth/actions.ts`, `cronograma-actions.ts`, `evaluation-actions.ts`,
`evaluation-results-actions.ts`, `evaluation-rounds-actions.ts`,
`forms/actions.ts`, `forms/response-actions.ts`, `hr-actions-history.ts`,
`hr-actions.ts`, `reports/actions.ts`, `reports/admin-actions.ts`,
`sector-actions.ts`, `ticket-actions.ts`, `tickets/actions.ts`,
`tickets/assign-actions.ts`, `tickets/history-actions.ts`, `tracking/actions.ts`,
`user-actions.ts`, `welcome-video-actions.ts`, `whatsapp/actions.ts`.

**Todas autenticam a si mesmas.** `reports/actions.ts` é a exceção deliberada:
o canal de denúncia roda sem sessão por requisito (anonimato), protegido por
bilhete HMAC + três contadores de rate limit.

### Instrumentação

`src/instrumentation.ts` — o Next chama `register()` uma vez por runtime, antes
de servir qualquer requisição. É o único gancho que existe para instalar
handler de processo no App Router: não há `server.js` próprio onde colocá-los.
Instala `process.on("unhandledRejection")`; **`uncaughtException` fica de fora
de propósito** (ver 9.1). Tem guarda `NEXT_RUNTIME !== "nodejs"`, sem a qual a
subida do runtime edge quebra — o middleware não tem `process.on`.

### Testes existentes

```
src/lib/auth/scope.test.ts             src/lib/auth/session-usage.test.ts
src/lib/forms/aggregate.test.ts        src/lib/forms/rules.test.ts
src/lib/forms/validation.test.ts       src/lib/permissions.test.ts
src/lib/phone.test.ts                  src/lib/storage/limits.test.ts
src/lib/ticket-visibility.test.ts      src/lib/whatsapp/connection.test.ts
src/lib/whatsapp/jid.test.ts           src/lib/describe-error.test.ts
--- exigem banco (npm run test:db) ---
src/lib/forms/core.dbtest.ts           src/lib/whatsapp/auth-state.dbtest.ts
src/lib/whatsapp/notify.dbtest.ts      src/lib/whatsapp/outbox.dbtest.ts
```

---

## 3. Autenticação e autorização

- **`src/lib/auth/session.ts`** — cookie `bc_session`, HMAC-SHA256 com
  `SESSION_SECRET`, `exp` **dentro** do payload assinado, validade 8 h,
  `httpOnly` + `sameSite: lax` + `secure` em produção.
- **`src/lib/auth/require-user.ts`** — `getCurrentUser()` e
  `getVerifiedSession()`. Ambos revalidam `sessionVersion` contra o banco. É o
  que faz demissão, troca de senha e rebaixamento valerem na requisição
  seguinte. **Todo caminho sensível usa estes**, nunca `getSession()` direto —
  há teste estrutural (`session-usage.test.ts`) proibindo importar `getSession`
  fora de `src/lib/auth`.
- **`src/middleware.ts`** — Next 15 usa `middleware.ts`; `proxy.ts` é Next ≥16,
  **não reportar que "falta proxy.ts"**. Verifica assinatura e prazo na borda
  (Web Crypto, o Edge não tem `node:crypto`). **Não é a fronteira de
  segurança** — é conveniência de navegação.

  Matcher atual:

  ```js
  matcher: [
    "/((?!_next/static|_next/image|api/health|api/cron|uploads|favicon.png|favicon.ico).*)",
  ]
  ```

- **`src/lib/permissions.ts`** — matriz única `COLABORADOR | GESTOR | ADMIN`.
  Nunca comparar `role` direto em componente.
- **`src/lib/auth/access.ts`** — RBAC por subsetor (`resolveAccessibleSlugs`,
  `canAccessSlug`).
- **`src/lib/auth/scope.ts`** — `canReachSector()`, recorte por setor nas
  avaliações. Criado nesta sessão.
- **`src/lib/rate-limit.ts`** — contadores em banco (tabela `RateLimit`), falha
  aberta de propósito. `clientIp()` lê o **último** item de `x-forwarded-for`,
  que é o único que o cliente não controla. Premissa: **um** proxy na frente.

---

## 4. Infraestrutura (medida em 08/09/2026)

| Item | Valor |
|---|---|
| VPS | Hostinger **KVM 4**, Ubuntu 24.04, `srv1550331.hstgr.cloud`, IP `187.127.10.50` |
| Painel | **EasyPanel** sobre **Docker Swarm** |
| RAM do host | 15992 MB total, **~11350 MB disponíveis** |
| Contêineres no host | **24** (inclui 5 Postgres de outros projetos) |
| Limite do contêiner | **Nenhum** — `HostConfig.Memory=0` |
| Contêiner | `producao_build-connect` |
| Volume de uploads | `/var/lib/docker/volumes/producao_build-connect_uploads/_data` |
| Usuário do processo | `uid 1000 (node)` — Dockerfile faz `USER node` |
| Proxy | Traefik via EasyPanel — **limites NUNCA inspecionados** |

Env em produção: `WHATSAPP_ENABLED=true`, `NODE_ENV=production`,
`UPLOADS_DIR=/var/www/app/uploads`, `CRON_SECRET` definida.

### Acesso do dono à VPS

SSH como `root@187.127.10.50` só funcionou **depois de redefinir a senha** pelo
painel da Hostinger. Há também o botão **"Web console"** no painel, que abre
terminal do host pelo navegador sem passar por SSH.

### Comandos de diagnóstico que funcionam

```sh
C=$(docker ps -q -f name=producao_build-connect)

# caminho do volume no host
docker inspect $C --format '{{range .Mounts}}{{if eq .Destination "/var/www/app/uploads"}}{{.Source}}{{end}}{{end}}'

# memória e limite próprio
free -m | head -2
docker inspect $C --format 'LimiteBytes={{.HostConfig.Memory}}'

# reinícios / OOM (só valem para a instância atual: o Swarm recria a cada deploy)
docker inspect $C --format 'ExitCode={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}} Reinicios={{.RestartCount}}'

# presença de variável SEM vazar valor
docker exec $C sh -c 'if [ -n "$CRON_SECRET" ]; then echo definida; else echo ausente; fi'
```

> **Cuidado:** `${VAR:+sim}${VAR:-nao}` **vaza o valor** quando a variável está
> definida (`:-` devolve o conteúdo). Foi assim que o `CRON_SECRET` vazou nesta
> sessão. Use o `if [ -n ... ]` acima.

---

## 5. Trabalho concluído nesta sessão

Doze commits, `993f6b4` → `2c39f4a`.

### Segurança (auditoria completa executada)

| Commit | O quê |
|---|---|
| `993f6b4` | **IDOR corrigido (HIGH).** `fetchRoundConsolidated` e `fetchEvaluationDetail` liam avaliação 360 de **qualquer setor**. Editar/excluir já passavam por `requireRoundScope`; as duas **leituras** não passavam por nada além de `evaluations.view`, que o GESTOR tem. Sem adivinhar id: `getMyEvaluationTasks` devolve o `roundId` a **todo** avaliador designado, e o roster do admin não é escopado. Extraído `canReachSector()` para `src/lib/auth/scope.ts`, com 7 testes. |
| `8858a5b` | **Sessão revogada (MEDIUM).** `/uploads/[...path]` usava `getSession()` — só assinatura e prazo. Desligado seguia baixando o acervo por até 8 h, e admin rebaixado seguia abrindo anexo de denúncia. Trocado por `getCurrentUser()`. Teste estrutural impede recaída. |

**Também auditado e considerado correto** (não refazer): travessia de diretório
em `/uploads`, `$queryRaw` só com template literal constante, ausência de
`$queryRawUnsafe` no projeto, `dangerouslySetInnerHTML` só com constante de
tema, segredos fora do Git (`.env` nunca commitado), `clientIp()` lendo o último
`x-forwarded-for`, canal anônimo de denúncias, upload com allowlist de extensão
**e** MIME, CSP/HSTS já configurados em `next.config.mjs`.

### Uploads

| Commit | O quê |
|---|---|
| `d639048` | Conferência de tamanho **no navegador**, antes de subir. Novo `src/lib/storage/limits.ts`. |
| `7d4ce76` | `storeFile` grava em **fluxo** (`pipeline` + `createWriteStream`) em vez de `Buffer.from(await file.arrayBuffer())`, que fazia segunda cópia integral. Fecha a brecha do arquivo parcial órfão. |
| `e71deeb` | **A causa raiz.** Ver seção 6. |
| `d691fdb` | Falha de disco parou de se disfarçar de falha de arquivo. Ver seção 7. |
| `dcc1bdb` | Cinco componentes com cinco tetos hardcoded (2, 10, 10, 500, 500 MB) passam a derivar de `storage/limits`. |
| `c77b8c5` | Vídeo 100 MB; corpo da requisição 165 MB. |
| `d84cacf` | Vídeo **150 MB**; corpo **215 MB**. O corpo teve de subir junto: os três tetos do modal somam 205. |
| `a285034` | Entrypoint: sonda de dois níveis, que é o que a aplicação faz. Ver 9.2. |
| `d4a3378` | `tsconfig.tsbuildinfo` fora do versionamento. |

### Robustez do processo

| Commit | O quê |
|---|---|
| `2c39f4a` | Quatro promessas do WhatsApp que podiam derrubar a intranet inteira. Novos `src/instrumentation.ts` e `src/lib/describe-error.ts` (+6 testes). Ver 9.1. |

---

## 6. A causa raiz das falhas de upload — leia antes de investigar qualquer coisa

Sintoma: envio de vídeo rodava o spinner por minutos e caía em
`An unexpected response was received from the server`, com a tela genérica
"Algo deu errado". Log do servidor:

```
Request body exceeded 10MB for /setores/vendas
[Error: aborted] { code: 'ECONNRESET' }
```

**Mecanismo:** a Server Action posta na URL **da própria página**. O matcher do
middleware cobre `/setores/*`. O Next então bufferiza o corpo **para o
middleware** antes de qualquer outra coisa, limitado por
`experimental.middlewareClientMaxBodySize` — cujo **padrão é 10 MB**. Acima
disso a requisição é abortada com ECONNRESET, e o cliente do Next não consegue
interpretar a resposta.

O `bodySizeLimit: "520mb"` que existia **nunca chegou a valer**: o portão do
middleware fecha primeiro, e é o mais baixo.

**Correção em `next.config.mjs`:**

```js
experimental: {
  middlewareClientMaxBodySize: "215mb",
  serverActions: { bodySizeLimit: "215mb" },
}
```

### Hipóteses investigadas e DESCARTADAS — não refaça este caminho

1. **OOM / falta de memória** — o host tem 16 GB, ~11 GB livres, sem limite por
   contêiner. `OOMKilled=false`.
2. **Timeout do proxy** — plausível pelo tempo decorrido, mas o erro do Next
   nomeia o limite e a rota, com evidência direta.
3. **`bodySizeLimit`** — estava em 520 MB, muito acima do que falhava.
4. **Promessas soltas do Baileys derrubando o processo** — é um defeito real, e
   foi corrigido em `2c39f4a` (seção 9.1), mas **não** era este bug: derruba o
   processo inteiro, não a requisição de upload.

---

## 7. Permissão no volume — RESOLVIDO em 08/09

`EACCES: permission denied, mkdir '/var/www/app/uploads/avatares/2026/09'`
aparecia na tela como **"Falha ao processar a foto"**, num JPEG de 44 KB.

**Causa:** o Dockerfile ganhou `USER node` em 02/09. As pastas criadas antes
ficaram `root:root` 755, e o uid 1000 não conseguia criar subpastas dentro. A
**raiz** do volume estava `drwxrwxrwx` (777), então o teste `[ -w ]` do
`docker-entrypoint.sh` passava e o contêiner subia normal — o problema só
aparecia no primeiro upload. A pasta `denuncias`, criada em 03/09 pela própria
aplicação, já era `ubuntu:ubuntu` (uid 1000): foi a pista que fechou o caso.

**Resolvido** com `chown -R 1000:1000` no volume. Verificado com
`docker exec ... mkdir -p .../avatares/teste` → `GRAVAVEL`.

**Correção de código junto:** gravação separada do processamento em `images.ts`
e `files.ts`. Falha de disco agora produz *"Não foi possível gravar no servidor.
Avise a TI: pode ser permissão na pasta de uploads"*, com syscall e caminho no
log. Vale de uma vez para avatar, comprovante, denúncia, anexo de chamado e
conteúdo de setor, porque todos os chamadores já exibem a mensagem de
`ImageProcessingError` / `FileStorageError`.

O ponto cego do entrypoint, que deixou isso passar despercebido na subida, foi
fechado em `a285034` — seção 9.2.

---

## 8. Limites de upload em vigor

Fonte única: **`src/lib/storage/limits.ts`**. Cliente e servidor leem do mesmo
lugar.

| Tipo | Teto |
|---|---|
| Vídeo | **150 MB** |
| Imagem / foto | 50 MB |
| Documento / instrução escrita / PDF | 50 MB |
| Transcrição | **5 MB** |
| `MAX_REQUEST_BYTES` (corpo) | **215 MB** |

- **Transcrição menor de propósito:** o texto vai inteiro para a coluna
  `transcriptText` no Postgres e é carregado toda vez que a tela do vídeo abre.
  5 MB já são ~2,5 milhões de caracteres.
- **215 MB de corpo:** precisa caber o pior envio legítimo do modal de vídeo —
  vídeo (150) + instrução (50) + transcrição (5) = 205 MB no mesmo FormData, e
  o resto é folga para o overhead do multipart. Há teste travando o invariante,
  e ele é o motivo de **mexer no teto de um tipo obrigar a recalcular o corpo**:
  sem isso existiria um envio que passa em cada campo e é recusado no conjunto —
  usuário escolhendo três arquivos válidos e levando "não".
- **Custo em memória:** 215 MB valem o **dobro** em RSS no pico (~430 MB),
  porque o corpo é bufferizado duas vezes — middleware e FormData. Contra os
  ~11 GB livres medidos no host, folga de mais de vinte vezes.
- **DUPLICAÇÃO OBRIGATÓRIA:** `MAX_REQUEST_BYTES` em `limits.ts` e os **dois**
  valores em `next.config.mjs` precisam andar juntos. O config é ESM puro e não
  importa TypeScript. Mexeu em um, mexa nos outros.
- `limits.ts` **não pode importar nada de `node:`** — é lido por Client
  Components.

---

## 9. Correções mapeadas — duas já saíram

### 9.1 WhatsApp podia derrubar a aplicação inteira — RESOLVIDO em 08/09 (`2c39f4a`)

**Arquivo:** `src/lib/whatsapp/connection.ts`

Quatro promessas sem tratamento de rejeição, **todas fora do ciclo de
requisição** (event handler ou timer): `void connect()` no timer de reconexão,
`void saveCreds()` na rotação de credencial, `QRCode.toDataURL(qr)` sem
`.catch()`, e `void clearAuthState()` no `loggedOut`.

No Node ≥15 uma rejeição não tratada **encerra o processo** — verificado
empiricamente: exit code 1. A imagem é `node:20-bookworm-slim` e
`WHATSAPP_ENABLED=true` em produção. Processo morto = **502 para todos os
usuários**, não só para quem usa WhatsApp. Quem mais ficava exposto era
justamente quem estava no meio de um upload de vídeo, que leva minutos.

**O que foi feito:**

1. `.catch()` nos quatro, cada um degradando onde faz sentido. O da reconexão
   reagenda via `scheduleReconnect()` — não vira laço porque `attempts`
   incrementa e `delayFor` tem teto de 5 min.
2. **`src/instrumentation.ts` novo**, com `register()` instalando
   `process.on("unhandledRejection")` para logar e seguir. É o segundo anel:
   pega o que escapar dos catches, inclusive de dentro do Baileys, onde não
   temos onde pôr `.catch()`.
3. **`uncaughtException` ficou DE FORA de propósito** — a ausência é a decisão,
   não o esquecimento. Depois dela o estado do processo é incerto; engolir troca
   uma queda limpa, que o Swarm reinicia em segundos, por uma aplicação de pé
   servindo dado corrompido, que ninguém percebe. Rejeição não tratada é
   diferente: é trabalho perdido com o resto do processo intacto.
4. **`src/lib/describe-error.ts` novo, com 6 testes.** `String(x)` **lança**
   para `Object.create(null)` e para Proxy que intercepta `toString`, e uma
   promessa pode ser rejeitada com QUALQUER valor. Sem o try/catch, a exceção
   nasceria dentro do handler da rejeição e derrubaria o processo — o oposto do
   que o handler existe para fazer. Módulo próprio, e não helper dentro de
   `connection.ts`, porque `instrumentation.ts` também precisa dele: importar
   `connection.ts` de lá puxaria o Baileys para a subida de todo runtime.

**Verificado** com script descartável: sem o handler, `exit 1`; com ele,
`exit 0` e o processo sobrevive às três formas de rejeição, `Object.create(null)`
incluído.

### 9.2 Entrypoint com ponto cego — RESOLVIDO em 08/09 (`a285034`)

**Arquivo:** `docker-entrypoint.sh`

Testava `[ ! -w "$UPLOADS_PATH" ]` só na **raiz** do volume. Como a raiz estava
777, deu sinal verde para um volume onde a aplicação não gravava em pasta
alguma — a falha da seção 7. Silenciosa na subida, barulhenta no primeiro
upload.

Agora faz `mkdir -p "$UPLOADS_PATH/.entrypoint-probe/nivel2"` seguido de
`rmdir`, que é exatamente o que `storeFile` faz ao particionar por ano/mês.
Testar um nível a menos era testar outra coisa.

**Verificado** com o bloco extraído e executado de verdade: volume saudável sai
0 e não deixa a sonda para trás; volume com subpasta impossível sai 1 com a
mensagem, num caso em que `[ -w ]` na raiz respondia SIM.

### 9.3 Vídeo acima de ~200 MB exige sair da Server Action

Enquanto o upload for Server Action, o corpo é bufferizado **duas vezes** (uma
pelo middleware, outra para montar o FormData). O consumo acompanha o tamanho do
arquivo.

**Desenho proposto:**
1. Rota `POST /api/upload` sob caminho **excluído do matcher** do middleware.
2. Recebe o **binário cru** no corpo (não multipart — evita `request.formData()`,
   que bufferiza), metadados em query/headers.
3. Auth própria com `getCurrentUser()` + permissão, como
   `src/app/uploads/[...path]/route.ts` já faz.
4. Escreve em fluxo: `pipeline(Readable.fromWeb(request.body), createWriteStream(...))`,
   validando o teto **enquanto** escreve (o `Content-Length` pode mentir).
5. Devolve um **token assinado HMAC** com caminho + regra + `userId` + `exp`.
   Reusar o padrão de `src/lib/reports/ticket.ts`, que já faz exatamente isso.
6. A Server Action passa a receber o token em vez do arquivo, confere assinatura
   e que o `userId` bate com a sessão, e cria o registro.

**Afeta três modais:** `sector/file-upload-modal.tsx`,
`sector/welcome-video-card.tsx`, `home/institutional-video.tsx`.
Estimativa: ~200 linhas. É superfície nova de upload autenticado — merece
atenção dedicada, não emenda no fim de sessão.

### 9.4 `error.tsx` sem retry automático

`src/app/error.tsx` só oferece botão manual. Qualquer blip de segundos durante
um deploy joga o usuário na tela de erro. Poderia tentar `reset()` uma vez após
~2 s antes de mostrar a tela.

### 9.5 Divisão actions/core nos módulos de avaliação

Os módulos de avaliação **não** têm a divisão `actions.ts` / `core.ts` que
Formulários tem. Por isso os testes que escrevi cobrem a *regra*
(`canReachSector`) mas não pegam "esqueci de chamar a guarda" — que foi
exatamente o defeito original. Aplicar o padrão de `forms/core.ts` seria a
defesa completa.

---

## 10. O que fazer agora — pendências abertas

### Validação em produção — é o gargalo de agora

Todo o trabalho de upload está no `main`, e **nada disso foi confirmado rodando
em produção.** Enquanto não for, é teoria.

1. **Forçar rebuild no EasyPanel.** `next.config.mjs` só vale com **imagem
   nova**; restart não adianta. E o entrypoint novo agora pode **impedir a
   subida** se o volume tiver problema de permissão — é o comportamento
   desejado, mas olhe o log de deploy.
2. **Subir um vídeo de 20–30 MB** em `/setores/<algum>`. Antes da correção do
   portão de 10 MB, qualquer coisa acima disso morria com ECONNRESET. É o teste
   que fecha o caso da seção 6.
3. **Confirmar a foto do usuário**, que o `chown` destravou.
4. **Limites do proxy Traefik/EasyPanel** — o único portão nunca inspecionado, e
   o candidato restante a "corrigi tudo e continua falhando". Teste que isola o
   proxy do app, porque `/api/health` está fora do matcher:

   ```sh
   head -c 220000000 /dev/urandom > /tmp/big.bin
   curl -s -o /dev/null -w '%{http_code} %{time_total}\n' \
     -X POST --data-binary @/tmp/big.bin https://buildconnectapp.com.br/api/health
   ```

   **405** (Method Not Allowed) = os 220 MB atravessaram o proxy e chegaram no
   Next, caminho livre. **413** ou conexão cortada = o Traefik é um segundo
   portão e precisa de label de configuração. O `time_total` denuncia timeout
   curto.
5. **Teste do IDOR corrigido:** como **GESTOR**, abrir Resultados no RH e
   expandir uma submissão e um consolidado **do próprio setor** — deve
   funcionar. Como ADMIN, de qualquer setor — deve funcionar.

### Aguardando resposta do dono

6. **`crontab -l | grep cron/evaluations`** — se vazio, **nenhuma notificação de
   WhatsApp sai sozinha** e a liberação de ciclos de avaliação só ocorre quando
   alguém abre a aba. Falha silenciosa, sem erro em lugar nenhum. O drenar
   manual fica em `drainWhatsappNow` na tela de administração.

### Ação de segurança pendente

7. **Rotacionar `CRON_SECRET`.** O valor vazou num comando de diagnóstico mal
   escrito (ver aviso na seção 4) e ficou registrado numa transcrição de chat.
   Risco baixo — só permite disparar `/api/cron/evaluations`, que libera ciclos
   e drena a fila; não dá acesso a dado. Trocar é barato: `openssl rand -base64 32`,
   atualizar no EasyPanel, atualizar o `Authorization: Bearer` do crontab.

### Decidido nesta sessão — não reabrir sem motivo novo

- **Vídeo fica em 150 MB**, não nos 400 do pedido original. Escolha do dono, por
  precaução. 400 MB não é uma linha em `limits.ts`: o corpo passaria de 1 GB e o
  caminho correto seria a rota em fluxo da seção 9.3.
- **`uncaughtException` continua derrubando o processo.** Ver 9.1, item 3.

### Dependências

- **LOW** — `postcss ≤8.5.22` transitivo via `next@15.5.25`, 4 advisories. Só
  exploráveis com CSS controlado pelo atacante; aqui o CSS é do repositório e
  processado em build. A correção disponível é `next@16` (major, traria
  `middleware.ts → proxy.ts`). Aguardar patch de `next@15.x`.
- **INFO** — `deepmerge-ts` via CLI do Prisma (devDependency, roda uma vez no
  entrypoint). Sem ação; `npm audit fix --force` rebaixaria o Prisma.

---

## 11. Armadilhas que já custaram tempo

- **Next 15 usa `middleware.ts`**, não `proxy.ts` (Next ≥16). Não reportar
  "falta proxy.ts".
- **`formatBytes` já existe** em `src/lib/utils.ts`. Não criar outro.
- **`src/lib/storage/limits.ts` não pode importar `node:`** — Client Components
  o leem.
- **Mexer no teto de um tipo obriga a recalcular `MAX_REQUEST_BYTES`** e os dois
  valores do `next.config.mjs`. Ver seção 8.
- **Ambiente de desenvolvimento: Windows, sem Python.** `python3` não existe.
  Heredoc de shell (`cat > arq <<'EOF'`) **quebra com conteúdo grande** —
  aconteceu ao escrever `files.ts`. Use a ferramenta de escrita de arquivo.
- **`git commit` leva o índice inteiro**, não só o que você acabou de `git add`.
  Uma remoção pendente foi varrida para dentro de um commit de segurança. Use
  `git commit -F - -- <paths>` com pathspec explícito.
- **EasyPanel roda Docker Swarm**: o contêiner é recriado a cada deploy, então
  `RestartCount` e `OOMKilled` só valem para a instância atual. Histórico de
  incidentes anteriores não está lá.
- **`${VAR:+sim}${VAR:-nao}` vaza o valor** da variável. Use `if [ -n "$VAR" ]`.
- Verificar mudanças de comportamento com **script descartável executando o
  código de verdade**, não só com o compilador. Foi assim que confirmei o
  streaming (5 MB byte a byte), as mensagens de erro de disco, a sonda do
  entrypoint nos dois casos e a sobrevivência do processo à rejeição não
  tratada. Escrever na raiz do projeto (o alias `@/` só resolve lá), rodar com
  `npx tsx`, e **apagar antes de commitar**.

---

## 12. Memória persistente do projeto

Há memórias de sessão em
`C:\Users\Marcos Lucas\.claude\projects\c--Users-Marcos-Lucas-Documents-Projetos-BuildConnectApp\memory\`:

- `dados-demo-ja-removidos.md` — o banco de produção já tem dados reais;
  `limpar-mock.sql` é pendência morta.
- `planos-precisam-de-especificidade.md` — nunca propor trabalho como título de
  uma linha; dizer arquivo, guarda, efeito na tela e verificação.
- `entregar-direto-no-main.md` — sem branch nem PR; o deploy sai do `main`.
