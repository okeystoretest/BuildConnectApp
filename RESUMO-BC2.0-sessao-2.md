# Build.Connect 2.0 — Resumo da Sessão 2

Base: `Build.Connect 2.0.zip`. Entrega em um pacote `.zip` **acumulado** (`Build.Connect_2.0_card-expandido-e-deploy.zip`), 28 arquivos, na estrutura de pastas do projeto — é só sobrescrever.

Escopo: Cronograma (cards, modal, expansão, regra de visibilidade) + preparação completa do deploy na VPS.

---

## 1. Cards do Cronograma

### Resumo das observações no card

`content-calendar.tsx`: o chip passou a exibir, abaixo do título, um resumo de `notes` — texto achatado, corte em 90 caracteres, `line-clamp-2`, texto completo no `title` do hover. No `production-backlog.tsx` o resumo virou segunda linha da coluna Título, truncada.

### Clique abre DETALHES, não o formulário

Novo `post-details-modal.tsx`: título, status, funil, formato, marca, data, horário, responsável, autor, alcance e observações completas.

- **Editar** aparece só com `canEdit`; fecha os detalhes e abre o `PostModal`.
- **Excluir** aparece só com `canDelete`, com confirmação inline.
- `cronograma-panel.tsx` guarda apenas o **ID** do post em detalhe e relê o objeto de `data.posts` a cada render — o modal acompanha o `router.refresh()` em vez de mostrar um retrato velho.
- `post-modal.tsx` perdeu o botão Excluir (migrou para os detalhes) e ficou só com criar/editar.

### Exclusão: regra alterada

Antes exclusiva de Admin; agora **dono do card ou Admin** (`canDeletePost`), validado na Server Action.

---

## 2. Expansão do card no calendário

Botão `+` no chip expande o card **dentro da célula do dia**; `−` recolhe. `Esc` também recolhe.

### Geometria

`absolute inset-0`: o card cobre a célula inteira — mesma moldura que o calendário já reserva para aquela data, inclusive por cima do número do dia (que o cabeçalho do próprio card mostra como `6/08`). A grade nunca muda de tamanho.

**Tela cheia usa exatamente a mesma geometria.** Vários posts no mesmo dia dividem essa área em partes iguais, separados por uma linha.

### Sem barra de rolagem, em lugar nenhum

Cabeçalho, título, selos e a linha responsável/horário são fixos e compactos; as observações ocupam a sobra (`flex-1 min-h-0 overflow-hidden`) e, quando o texto excede, um degradê no rodapé sinaliza a continuação em vez de cortar seco. O degradê usa `hsl(var(--bc-surface))` ou a cor da marca — acompanha claro/escuro sem condicional.

> **A pegadinha que custou duas iterações:** item de flex nasce com `min-height: auto` e se recusa a encolher abaixo do próprio conteúdo. Os cards tinham `flex-1 basis-0`, mas o texto os empurrava para além da altura disponível: em vez de dividirem a célula, transbordavam. **`min-h-0` no card** é o que faz a divisão funcionar. Altura mínima (`min-h-[124px]`) foi removida pelo mesmo motivo — mínimo gera transbordo, transbordo gera barra.

### Densidade automática

Com 3 ou mais posts no dia (`dense`), o título cai para uma linha e os selos de status e marca saem — funil e formato bastam para identificar o post. A decisão vem da **contagem de posts**, não de medir altura em tempo de execução: é determinístico, dispensa `ResizeObserver` e não pisca no primeiro render.

### Detalhes de comportamento

- O chip virou `div` clicável: botão dentro de botão é HTML inválido e o clique interno se perderia.
- Clicar em qualquer ponto do card expandido abre o modal de detalhes.
- Horário fica **ao lado do responsável** (`09:00 · Fulano`), não no cabeçalho — quem produz precisa dos dois juntos.
- Observações em 11px, um degrau acima dos selos (9px).
- Dois regimes de expansão: visão normal = um card por vez; tela cheia = **todos já expandidos**. O estado guarda apenas a *exceção* ao padrão do regime, então entrar e sair da tela cheia faz o padrão voltar a valer sozinho.

---

## 3. Regra de alcance: Marketing × Vendas

Nova coluna `ContentPost.visibility` (`ContentVisibility`: SHARED | PRIVATE) + `originSlug`.

| Onde foi criado | visibility | Quem vê | Quem edita/exclui |
|---|---|---|---|
| Aba Marketing | SHARED | todos os setores da base compartilhada | só o autor (Admin override) |
| Demais abas (Vendas) | PRIVATE | só o autor | só o autor (Admin override) |

- Política num ponto único: `src/lib/cronograma-visibility.ts` (`visibilityForSlug`, `MARKETING_SLUG`, rótulos).
- O alcance é derivado da aba na **Server Action** — nunca vem do cliente — e **não muda em edição**: `updateContentPost` não toca em `visibility` nem `originSlug`.
- O filtro de visibilidade é aplicado **na consulta** (`getCronogramaData`): o que não pode ser visto não chega ao cliente.
- O cabeçalho da ferramenta informa o alcance do que for criado naquela aba.

---

## 4. Deploy — Easy Panel + Docker

Cenário: primeiro deploy, app como serviço Docker do Easy Panel, Postgres do Easy Panel já usado por outros dois projetos, domínio já apontando para a VPS.

Muda em relação às diretrizes originais: proxy reverso e SSL são do **Traefik do Easy Panel** (não Nginx à mão) e quem mantém o processo vivo é o **Docker** (não PM2). Postgres, disco local para uploads e `sharp` → `.webp` permanecem idênticos.

### Bloqueio encontrado: `/uploads` respondia 404

Não existia rota servindo os arquivos enviados. Os binários ficam em `UPLOADS_DIR`, **fora de `public/`**, e o plano original dependia de um `alias` no Nginx — que um container não tem. Criado `src/app/uploads/[...path]/route.ts`: barreira contra travessia de diretório, `Content-Type` por extensão, cache imutável e suporte a `Range` (vídeo com seek). Nada do que já está no banco muda.

### Arquivos de infraestrutura

| Arquivo | Para quê |
|---|---|
| `Dockerfile` | Debian slim (`sharp` e Prisma têm binário glibc pronto; Alpine exigiria compilar). Etapa única: o mesmo `node_modules` compila, roda migrations e os scripts de manutenção. |
| `docker-entrypoint.sh` | `prisma migrate deploy` antes de subir. Migration falhou, container não sobe. |
| `.dockerignore` | `node_modules`, `.next`, `.git`, `.env`, `uploads` fora do contexto de build. |
| `.env.example` | Todas as variáveis lidas pelo sistema, comentadas. |
| `DEPLOY-EASYPANEL.md` | Passo a passo completo, verificação pós-deploy, backup e tabela de erros. |

### Três armadilhas do Easy Panel

1. **Build por Dockerfile, não Nixpacks** — Nixpacks não garante `openssl` nem a ordem `prisma generate` → `build`.
2. **Volume em `/var/www/app/uploads`** — sem ele, todo arquivo enviado some no próximo deploy e o banco fica apontando para o vazio.
3. **App e Postgres no mesmo projeto**, com o host da `DATABASE_URL` sendo o **nome do serviço** (rede interna do Docker), não `localhost` nem IP público.

### Postgres compartilhado

Não impacta, desde que o Build.Connect tenha **database e usuário próprios** — as migrations do Prisma agem sobre o schema inteiro. Postgres 15+ exige `GRANT ALL ON SCHEMA public` para o novo usuário; sem isso a primeira migration falha com *permission denied for schema public*.

---

## 5. Migration

`20260820120000_content_visibility` — enum `ContentVisibility`, colunas `visibility` (default SHARED) e `originSlug`, backfill de origem pelo slug do subsetor, índice `(subsectorId, visibility)`.

Default SHARED nos registros existentes: nada some da agenda de ninguém no deploy.

---

## 6. Comandos

```bash
# Local, antes de subir
npx prisma generate && npm run build

# VPS: o entrypoint aplica as migrations sozinho no start.
# No console do app, uma única vez:
npx prisma db seed
npm run setup:cronograma
```

---

## 7. Verificação feita

- `tsc --noEmit` limpo nos arquivos alterados. Restam apenas dois erros pré-existentes em `prisma/seed.ts`, por causa do client do Prisma não gerado no ambiente de análise.
- Layout do calendário validado em **protótipo com as classes reais**, Tailwind do projeto compilado e render em Chromium a 1600x900, com 1, 2 e 3 cards por célula. Varredura do DOM confirmou: nenhum elemento com `overflow-y: auto` ou `scroll` — só `hidden`, que corta sem barra.
- `next build` completo não roda no ambiente de análise: `next/font` baixa Outfit e JetBrains Mono do Google no momento do build e a rede é fechada aqui. **Na VPS isso funciona**, mas fica o registro — a máquina de build precisa de saída para `fonts.googleapis.com`.

---

## 8. Pendências / decisões em aberto

- **Natureza da atividade vem da aba de criação**, não do cadastro do usuário. Um usuário com acesso a todo o Comercial que criar pela aba Marketing gera atividade compartilhada. Para olhar o vínculo do usuário, é uma função em `cronograma-visibility.ts`.
- **Posts anteriores ao deploy ficam SHARED.** Para privatizar os que nasceram em Vendas:
  ```sql
  UPDATE "ContentPost" SET "visibility" = 'PRIVATE' WHERE "originSlug" <> 'marketing';
  ```
  Avaliar antes — eles somem da vista dos demais.
- **Limite de upload no proxy**: vídeo aceita até 500 MB. Se um envio grande falhar com 413, ajustar o limite de corpo nas opções avançadas do domínio/Traefik.
- **Backup precisa cobrir duas coisas**: dump do Postgres *e* `tar` do volume de uploads. Backup do banco sozinho restaura um sistema com todos os caminhos apontando para o vazio.
