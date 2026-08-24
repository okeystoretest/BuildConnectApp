# Build.Connect 2.0 — Sessão 4: deploy executado na VPS

Status: **aplicação no ar e funcional**. Pendência única: certificado TLS do domínio próprio.

---

## 1. Correções de código aplicadas antes do deploy

Quatro problemas encontrados na análise da base, nenhum visível em desenvolvimento. Entregues no pacote `Build.Connect_2.0_deploy-fixes.zip` (7 arquivos).

| Arquivo | Problema | Correção |
|---|---|---|
| `next.config.mjs` | **Bloqueador.** Todo upload passa por Server Action com `FormData`, e o limite padrão de corpo é **1 MB**. Qualquer foto de celular falharia com *"Body exceeded 1 MB limit"* mesmo com volume e proxy corretos. | `experimental.serverActions.bodySizeLimit = "520mb"`, acompanhando o teto de 500 MB de `src/lib/storage/files.ts`. |
| `src/middleware.ts` | O matcher capturava `/api/health` e `/api/cron`. Rotas sem cookie de sessão: o health check receberia 302 para `/login` e passaria **sempre**, inclusive com o banco caído; a rota de cron (autenticada por `CRON_SECRET`) nunca executaria. | Ambas excluídas do matcher. |
| `.gitignore` | **Não existia** — só um `.gitignore.additions` com instruções. O `git add .` commitaria `.env` com a senha do banco e o `SESSION_SECRET`. | `.gitignore` completo na raiz. |
| `prisma/seed.ts` | Senha fixa `senha123` para todos os usuários, admin incluído, numa aplicação exposta na internet. | Lê `SEED_PASSWORD` do ambiente e **recusa rodar em produção** sem ela. |
| `src/app/api/health/route.ts` | *(novo)* Não havia health check. | Responde 200 só se o Postgres responder ao `SELECT 1`; 503 caso contrário. |

---

## 2. Infraestrutura provisionada

### Onde ficou, e por que

O plano grátis do Easy Panel limita **projetos a 3** — todos já em uso (`buildflow`, `buildsales`, `producao`). Mas **serviços por projeto são ilimitados**, e a rede interna do Docker é **por projeto**: app e banco precisam estar juntos de qualquer forma.

Adicionar serviço a um projeto existente **não é consolidar projetos**. Cada serviço é um container próprio, com imagem, volume e variáveis próprios; os containers que já rodavam não foram reiniciados nem reconfigurados. `buildflow` e `buildsales` ficaram intocados.

Escolhido o projeto **`producao`**, que já era multi-app com Postgres separado por aplicação (`db-fluxopedido`, `db-okeytech`) — mesmo padrão.

> **Regra a memorizar:** para remover o app um dia, use **Delete service**. **Delete project** apaga todos os serviços do projeto, Postgres incluído.

### Serviços criados

**`db-buildconnect`** (Postgres 16.15)

| Campo | Valor | Motivo |
|---|---|---|
| Banco / usuário | `buildconnect` / `buildconnect` | O padrão era banco `producao` e usuário `postgres` (superusuário). Nomes explícitos e usuário comum. |
| Senha | vazia (gerada) | O painel gera forte e entrega a connection string já escapada. |
| Imagem | `postgres:16` **fixa** | Deixar vazio usa "a mais recente": num rebuild futuro uma major nova encontraria um diretório de dados incompatível e o container não subiria. |

Postgres **dedicado**, não reaproveitado: as migrations do Prisma agem sobre o schema inteiro do database.

**`build-connect`** (App, build por Dockerfile)

- Source: GitHub, repositório privado, branch `main`, build path `/`, Auto Deploy ligado.
- Build: **Dockerfile**, não Nixpacks — Nixpacks não garante `openssl` (engine do Prisma) nem a ordem `prisma generate` → `next build`.
- Volume: `uploads` → `/var/www/app/uploads`.
- Domínio: `buildconnectapp.com.br` → porta **3000**.

### Variáveis de ambiente

```
DATABASE_URL=postgres://buildconnect:SENHA@producao_db-buildconnect:5432/buildconnect?schema=public
SESSION_SECRET=<openssl rand -base64 48>
CRON_SECRET=<openssl rand -base64 32>
UPLOADS_DIR=/var/www/app/uploads
NODE_ENV=production
PORT=3000
```

`SEED_PASSWORD` **não** entra aqui — vai só no comando do seed, uma vez.

**A `DATABASE_URL` não deve ser montada à mão.** O hostname interno deriva do nome do projeto *e* do serviço (`producao_db-buildconnect`) e o formato varia por versão. A aba **Credenciais** do serviço Postgres entrega a URL pronta; basta acrescentar `?schema=public`.

---

## 3. GitHub

Ordem obrigatória: repositório e token **antes** de criar o app — repositório privado não aparece na lista do Easy Panel sem token.

1. Repositório **privado**, criado vazio (sem README/`.gitignore`/license — arquivo inicial cria commit que conflita com o primeiro push).
2. `git init` → `git add .` → **conferir que `.env` não entrou** → commit → push. Senha de conta não funciona no push desde 2021: use o PAT no campo de senha.
3. **Personal access token fine-grained**, escopado só neste repositório: Metadata (read), Contents (read), Webhooks (read/write, para auto-deploy). O clássico equivalente exigiria `repo` + `admin:repo_hook`, que abrem a conta inteira.
4. Easy Panel → **Configurações → GitHub** → colar o token. Configuração **do servidor**, feita uma vez.

Anote a data de expiração do token: quando vencer, o deploy para sem aviso claro.

---

## 4. Migrations e seed

Migrations são **automáticas**: o `docker-entrypoint.sh` roda `prisma migrate deploy` antes de subir o servidor, a cada start. As 11 migrations entraram no primeiro deploy. Se uma falhar, o container **não sobe** — proposital.

Seed, uma vez só, pelo Console do app:

```bash
SEED_PASSWORD="<senha forte>" npx prisma db seed
npm run setup:cronograma
```

### Credenciais criadas

Login é por **username**, não e-mail. Todos nascem com a senha do `SEED_PASSWORD`.

| Usuário | Nome | Papel |
|---|---|---|
| `beatriz#BC` | Beatriz Souza | ADMIN |
| `marcos#BC` | Marcos Lucas | ADMIN |
| `carlos#BC` | Carlos Mendes | GESTOR (Comercial → Vendas) |
| `ana#BC` | Ana Ribeiro | COLABORADOR (Logística → Estoque) |
| `pedro#BC` | Pedro Dias | COLABORADOR (Logística → Motoristas) |

**Pendente:** trocar as senhas dos dois ADMIN pela interface e avaliar a desativação dos usuários de demonstração.

---

## 5. Pendência aberta: certificado TLS

`https://buildconnectapp.com.br` serve o **autoassinado do Traefik** (CN "Easypanel", validade de 10 anos) — o fallback usado quando não existe certificado ACME para o host. O domínio **não aparece** na lista de Certificados do Easy Panel.

### Hipóteses já eliminadas

| Verificação | Resultado |
|---|---|
| DNS | `A @ → 187.127.10.50`, resolve corretamente da internet pública. |
| Porta 80 | Aberta. `curl.exe -I http://buildconnectapp.com.br` responde `308` do Traefik. |
| Registro CAA | Ausente — nada bloqueia o Let's Encrypt. |
| ACME do servidor | **Funciona.** Cinco certificados emitidos para outros domínios: `buildflowapp.com.br`, `buildboard.com.br`, `app.` e `api.buildboard.com.br`, `buildsale.com.br`. |
| Nameservers | Idênticos aos dos domínios que têm certificado (`*.dns-parking.com`). |
| Resolvedor `letsencrypt` | Preenchido e persistido na aba SSL do domínio. |
| Redeploy do app | Feito. Não gerou o certificado. |

Ou seja: o mecanismo funciona neste servidor e o domínio está correto. O problema é específico deste roteador do Traefik.

### Causa provável

O domínio foi criado **sem resolvedor**, e o Traefik gerou a configuração daquele roteador sem ACME. Preencher o campo depois não faz ele reprocessar — e o redeploy do app não foi suficiente para regenerar.

### Próximos passos

1. **Recriar a entrada do domínio**: remover e adicionar de novo preenchendo tudo antes do primeiro salvamento — host, porta 3000, HTTPS, e `letsencrypt` na aba SSL. Roteador criado do zero com resolvedor dispara a emissão na hora.
2. **Se não resolver, ler o log do Traefik.** É o que falta; o Let's Encrypt diz em uma linha o que recusou.
   ```bash
   ssh root@187.127.10.50
   docker logs $(docker ps -qf name=traefik) 2>&1 | grep -i "buildconnectapp\|acme" | tail -40
   ```
   O Traefik roda fora dos projetos — nenhum console de serviço do Easy Panel alcança ele.

### Impacto enquanto não resolve

O cookie de sessão usa `secure: true` em produção, então **o navegador só o guarda em HTTPS válido**. Em HTTP puro o login parece falhar em silêncio: as credenciais são enviadas, a página recarrega e volta ao `/login`, sem erro visível.

Contorno para testar: usar o **domínio automático do Easy Panel** (`producao-build-connect.kguhj4.easy...`), que já vem com certificado válido.

---

## 6. Verificação ainda não feita

O teste que fecha o deploy de ponta a ponta, a fazer depois do certificado:

- [ ] Login pelo domínio próprio, com cadeado.
- [ ] `/api/health` responde 200 com `"db":"up"`.
- [ ] **Upload de imagem acima de 1 MB** — testa junto a rota `/uploads`, o volume e o `bodySizeLimit`.
- [ ] Upload de vídeo grande sem **413** (se ocorrer, é limite de corpo do proxy, ajustável nas opções avançadas do domínio).
- [ ] **Redeploy e reabrir a mesma imagem.** Se sumir, o volume não está montado. É este teste que separa "funcionou" de "vai funcionar semana que vem".
- [ ] Senhas dos ADMIN trocadas.
- [ ] Segunda entrada de domínio para `www` — certificado é por host, e o CNAME `www` existe mas não tem roteador.

---

## 7. Notas de infraestrutura

- **Disco: 192,7 GB, não 1 TB** (46,7 usados). O sistema aceita vídeo de até 500 MB por arquivo; algumas centenas de vídeos consomem o espaço livre. Monitorar antes de o onboarding encher de conteúdo.
- **Backup precisa cobrir duas coisas**: dump do Postgres **e** `tar` do volume de uploads, no mesmo agendamento. Backup do banco sozinho restaura um sistema com todos os caminhos apontando para o vazio. O backup agendado do Postgres é recurso do plano Hobby (US$ 10,90/servidor/mês).
- **Não exponha o Postgres** (aba "Expor"). O app fala com ele pela rede interna.
- **Console do serviço Postgres**: o botão "Postgres Client" roda `psql` como `postgres`, role que não existe nesta instância. Use **Bash** e depois `psql -U buildconnect -d buildconnect`.
