# Build.Connect 2.0 — Deploy na VPS Hostinger (Easy Panel + Docker)

Guia de execução do **primeiro deploy**. Cenário: VPS Hostinger com Ubuntu e Easy Panel, Postgres do Easy Panel já em uso por outros dois projetos, domínio já apontado para a VPS.

O que muda em relação às diretrizes originais do projeto: proxy reverso e SSL são do **Traefik do Easy Panel**, não de um Nginx configurado à mão; quem mantém o processo vivo é o **Docker**, não o PM2. Postgres, disco local para uploads e `sharp` → `.webp` permanecem idênticos.

Tempo estimado: 40–60 min, sendo ~10 min de build.

---

## 0. Correções aplicadas nesta entrega

Antes do passo a passo, o que mudou no código — três coisas quebrariam em produção e nenhuma aparece em desenvolvimento.

| Arquivo | Problema | Correção |
|---|---|---|
| `next.config.mjs` | **Bloqueador.** Todo upload passa por Server Action com `FormData`. O limite padrão de corpo de Server Action no Next é **1 MB** — qualquer foto de celular acima disso falharia com *"Body exceeded 1 MB limit"*, mesmo com volume e proxy corretos. | `experimental.serverActions.bodySizeLimit = "520mb"`, acompanhando o teto de 500 MB de `src/lib/storage/files.ts`. |
| `src/middleware.ts` | O matcher pegava `/api/health` e `/api/cron`. Rotas sem cookie de sessão: o health check receberia 302 para `/login` e passaria **sempre**, e a rota de cron (que se autentica sozinha por `CRON_SECRET`) nunca executaria. | Ambas excluídas do matcher. |
| `.gitignore` | **Não existia** — só um `.gitignore.additions` com instruções. O `git add .` do passo 2 commitaria `.env` (com a senha do banco e o `SESSION_SECRET`) e a pasta `uploads/`. | `.gitignore` completo na raiz. |
| `prisma/seed.ts` | Senha fixa `senha123` para todos os usuários, admin incluído — numa aplicação exposta na internet. | Lê `SEED_PASSWORD` do ambiente e **recusa rodar em produção** sem ela. |
| `src/app/api/health/route.ts` | *(novo)* Não havia health check. | Responde 200 só se o Postgres responder ao `SELECT 1`. Container vivo com banco caído passa a ser reportado como não saudável. |
| `src/app/uploads/[...path]/route.ts` | Serve os binários de `UPLOADS_DIR`, que fica **fora de `public/`**. O plano original dependia de um `alias` no Nginx, que um container não tem. Sem esta rota, **toda imagem, vídeo e documento enviado responde 404**. | Já entregue na sessão anterior — confirme que está no projeto. |

---

## 1. Preparar o banco no Postgres do Easy Panel

Compartilhar a instância com os outros dois projetos **não é problema**, desde que o Build.Connect tenha **database e usuário próprios**. Nunca compartilhe database entre aplicações: as migrations do Prisma agem sobre o schema inteiro.

Easy Panel → serviço **Postgres** → aba **Console** (ou `psql` pelo terminal da VPS):

```sql
CREATE USER buildconnect WITH PASSWORD 'SENHA_FORTE_AQUI';
CREATE DATABASE buildconnect OWNER buildconnect;
```

Conecte-se **ao novo database** e garanta o schema público:

```sql
\c buildconnect
GRANT ALL ON SCHEMA public TO buildconnect;
ALTER SCHEMA public OWNER TO buildconnect;
```

> Postgres 15+ nega escrita no schema `public` para usuários comuns por padrão. Sem esse `GRANT`, a primeira migration falha com *permission denied for schema public*.

Anote o **nome exato do serviço Postgres** na tela do Easy Panel — é ele que vai na connection string, não `localhost` nem o IP público.

---

## 2. Subir o código para um repositório Git

O Easy Panel puxa do repositório e refaz o build a cada deploy — sem upload manual, com histórico e rollback.

Na raiz do projeto local, **depois de sobrescrever os arquivos desta entrega**:

```bash
git init
git add .
git commit -m "Build.Connect 2.0 — deploy inicial"
git branch -M main
git remote add origin git@github.com:SUA_CONTA/build-connect.git
git push -u origin main
```

**Confira antes de dar push** — o `.gitignore` desta entrega cobre, mas verifique:

```bash
git ls-files | grep -E "^\.env$|^uploads/|^node_modules/"
```

Precisa sair **vazio**. Se `.env` aparecer, o segredo já está no histórico: `git rm --cached .env`, recommit, e **troque a senha do banco e o `SESSION_SECRET`** antes de subir.

Repositório **privado**. O código tem regras de negócio e estrutura de RBAC.

---

## 3. Gerar os segredos

Na sua máquina ou no terminal da VPS:

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # CRON_SECRET (opcional)
openssl rand -base64 24   # SEED_PASSWORD (senha inicial do admin)
```

Guarde os três. Trocar o `SESSION_SECRET` depois derruba todas as sessões ativas.

---

## 4. Criar o App no Easy Panel

1. Abra o **mesmo projeto** onde está o Postgres → **+ Service** → **App**.
   Projetos diferentes podem não se alcançar pela rede interna do Docker. Mesmo projeto resolve.
2. Nome do serviço: `build-connect`.
3. Aba **Source**: GitHub/Git → seu repositório → branch `main`.
   Repositório privado: autorize o Easy Panel na sua conta ou cadastre a deploy key que ele exibir.
4. Aba **Build**: método **Dockerfile**, caminho `Dockerfile`.

> **Não use Nixpacks.** Ele não garante `openssl` (requisito do engine do Prisma) nem a ordem `prisma generate` → `next build`. O Dockerfile desta entrega garante os dois e ainda aplica as migrations no start.

---

## 5. Variáveis de ambiente

Aba **Environment**, uma por linha:

```
DATABASE_URL=postgres://buildconnect:SENHA_FORTE_AQUI@NOME_DO_SERVICO_POSTGRES:5432/buildconnect?schema=public
SESSION_SECRET=<saída do openssl rand -base64 48>
UPLOADS_DIR=/var/www/app/uploads
NODE_ENV=production
PORT=3000
CRON_SECRET=<opcional>
GEOCODE_USER_AGENT=build-connect/1.0 (contato@suaempresa.com.br)
```

Pontos que costumam custar uma hora de log:

- O host da `DATABASE_URL` é o **nome do serviço Postgres**, não `localhost`.
- Se a senha do banco tiver `@`, `:`, `/` ou `#`, faça URL-encode (`@` → `%40`).
- `SESSION_SECRET` precisa de **no mínimo 16 caracteres** — o sistema recusa subir abaixo disso.
- `UPLOADS_DIR` tem que bater **exatamente** com o mount path do passo 6.
- **Não** defina `SEED_PASSWORD` aqui. Ela vai só no comando do seed, uma vez (passo 8).

---

## 6. Volume persistente para os uploads (não pule)

Aba **Mounts / Volumes** → **Add volume**:

- **Type**: Volume
- **Name**: `uploads`
- **Mount path**: `/var/www/app/uploads`

Sem o volume, todo arquivo enviado é apagado no próximo deploy — e o banco fica apontando para arquivos que não existem mais. Não há recuperação: os binários só existem no disco.

---

## 7. Domínio, HTTPS e limite de upload

Aba **Domains** → **Add domain**:

- **Host**: seu domínio (já apontado para a VPS).
- **Port**: `3000`
- **HTTPS**: ligado (Let's Encrypt via Traefik, automático).
- **Redirect HTTP → HTTPS**: ligado.

**Limite de corpo da requisição.** O sistema aceita vídeo de até 500 MB, mas o Traefik/proxy pode cortar antes. Se um envio grande falhar com **413**, ajuste o limite nas opções avançadas do domínio. O sintoma diferencia a causa: **413** é o proxy; *"Body exceeded..."* é o Next (e já está resolvido no `next.config.mjs`).

---

## 8. Primeiro deploy

Clique em **Deploy** e acompanhe o log. Sequência esperada:

1. `npm ci` → `prisma generate` → `next build` *(o mais demorado, ~5–10 min na primeira vez)*
2. `[entrypoint] aplicando migrations…` seguido da lista de migrations aplicadas
3. `[entrypoint] iniciando aplicação…` e o Next escutando na 3000

Terminado, abra o **Console** do app e popule a base — **nesta ordem**:

```bash
SEED_PASSWORD="<sua senha forte>" npx prisma db seed
npm run setup:cronograma
```

O primeiro cria setores, subsetores e o usuário admin. O segundo cria Marketing, liga a Vendas e habilita o Cronograma. Ambos são idempotentes, mas rode uma vez e confira o resultado.

> Uma das migrations antigas (`20260819140000_...`) é **destrutiva** — remove a tabela `WrittenDoc`. Em base nova é irrelevante: não há nada para perder.

**Logo depois do primeiro login, troque a senha do admin pela interface.** A senha do seed é a mesma de todos os usuários criados.

---

## 9. Health check

Aba **Advanced / Health check** do app:

- **Path**: `/api/health`
- **Port**: `3000`
- **Interval**: 30s · **Timeout**: 5s · **Retries**: 3

A rota responde `200 {"status":"ok","db":"up"}` só quando o Postgres responde; `503` caso contrário. Teste direto:

```bash
curl -i https://SEU_DOMINIO/api/health
```

---

## 10. Verificação pós-deploy

- [ ] `https://SEU_DOMINIO` abre a tela de login com cadeado válido.
- [ ] `/api/health` responde 200 com `"db":"up"`.
- [ ] Login autentica com as credenciais do seed.
- [ ] Sidebar mostra Comercial → Vendas e Marketing.
- [ ] **Vendas → Cronograma**: calendário renderiza; `+` expande o card na célula do dia, `−` recolhe, `Esc` recolhe.
- [ ] Criar um post em Vendas → aparece só para você. Criar em Marketing → aparece para todos.
- [ ] Clicar num card abre o modal de detalhes, com Editar/Excluir conforme a autoria.
- [ ] **Upload de imagem > 1 MB** (foto de celular): salva e aparece na tela. É o teste conjunto da rota `/uploads`, do volume e do `bodySizeLimit`.
- [ ] Upload de vídeo grande: sobe sem 413.
- [ ] **Redeploy e reabrir a mesma imagem.** Sumiu? O volume não está montado. Este teste é o que separa "funcionou" de "vai funcionar semana que vem".
- [ ] Senha do admin trocada pela interface.

Checagem do alcance dos posts, direto no Postgres:

```sql
SELECT title, visibility, "originSlug", "createdAt"
FROM "ContentPost" ORDER BY "createdAt" DESC LIMIT 10;
```

---

## 11. Backup — configure antes de existirem dados de verdade

Duas coisas precisam de cópia, e uma delas não está no banco:

1. **Postgres** — ative o backup agendado do serviço no Easy Panel para o database `buildconnect`. Manual:
   ```bash
   pg_dump -U buildconnect -d buildconnect -F c -f /backup/buildconnect_$(date +%F).dump
   ```
2. **Volume de uploads** — os binários vivem só no disco:
   ```bash
   tar czf /backup/uploads_$(date +%F).tar.gz -C /var/www/app uploads
   ```

No **mesmo agendamento**. Backup do banco sem backup dos uploads restaura um sistema com todos os caminhos apontando para o vazio.

---

## 12. Atualizações futuras

```bash
git add . && git commit -m "descrição" && git push
```

E **Deploy** no Easy Panel. As migrations novas entram sozinhas pelo entrypoint.

**Rollback**: reimplantar o commit anterior pela interface. Lembre que **migration aplicada não volta sozinha** — se a alteração mexeu no schema, prepare a migration reversa antes de precisar dela.

---

## 13. Tabela de erros

| Sintoma | Causa provável |
|---|---|
| Build quebra em `prisma generate` | `openssl` ausente — está usando Nixpacks em vez do Dockerfile. |
| Build falha em `layout.tsx` com *Failed to fetch font* | `next/font` baixa Outfit e JetBrains Mono do Google durante o build. A máquina de build precisa de saída para `fonts.googleapis.com`. |
| `Can't reach database server` | Host da `DATABASE_URL` errado (precisa ser o nome do serviço Postgres), ou app e banco em projetos diferentes do Easy Panel. |
| `permission denied for schema public` | Faltou o `GRANT ALL ON SCHEMA public` do passo 1. |
| `password authentication failed` | Caractere especial na senha sem URL-encode na connection string. |
| Container reinicia em loop no start | Migration falhando. O log do entrypoint mostra qual. |
| `SESSION_SECRET ausente ou curto demais` | Variável não definida ou com menos de 16 caracteres. |
| Seed aborta com *SEED_PASSWORD não definida* | Comportamento esperado em produção. Rode com `SEED_PASSWORD="..." npx prisma db seed`. |
| Upload falha com *"Body exceeded 1 MB limit"* | `next.config.mjs` sem o `bodySizeLimit` desta entrega. |
| Upload grande falha com **413** | Limite de corpo do proxy. Ajuste nas opções avançadas do domínio. |
| Imagem enviada dá **404** | Rota `src/app/uploads/[...path]/route.ts` ausente, ou `UPLOADS_DIR` ≠ mount path. |
| Imagens somem após deploy | Volume não montado — os arquivos estavam dentro do container. |
| Health check verde com banco caído | Middleware sem a exclusão de `api/health` desta entrega (está retornando 302). |

---

## 14. Pendências conhecidas

- **Posts anteriores ao deploy ficam SHARED.** Base nova, não se aplica agora. Se um dia migrar dados antigos, avalie antes:
  ```sql
  UPDATE "ContentPost" SET "visibility" = 'PRIVATE' WHERE "originSlug" <> 'marketing';
  ```
- **Natureza da atividade vem da aba de criação**, não do cadastro do usuário: quem tem acesso a todo o Comercial e cria pela aba Marketing gera atividade compartilhada.
- **Fontes via Google no build**: se a política de rede da VPS fechar saída HTTP, é preciso servir Outfit e JetBrains Mono localmente com `next/font/local`.
