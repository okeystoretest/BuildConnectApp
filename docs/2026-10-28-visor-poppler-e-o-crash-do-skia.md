# O visor de documentos: por que o pdfjs saiu e o poppler entrou

28 de outubro de 2026

Continua `docs/2026-10-26-dp-vencimentos-e-painel.md` e a rodada de 27/10, que criou o
visor protegido. Aquela rodada deixou como pendência número 2: *"PDF complexo não foi
testado"*. Esta rodada testou, e a resposta foi pior do que se esperava — **todo PDF
daquele tipo derrubava o servidor inteiro**, não só a requisição.

## Estado

**A correção está em produção e funcionando.** Commit `2da09b2`, deploy feito, e o
documento que matava o Next abre pelo Meu Setor com as 7 páginas.

**As deleções em `docs/` saíram da fila nesta rodada.** Aquele `git status` com 23 linhas
`D docs/...`, que arrastava desde setembro e que as sessões anteriores mandavam ignorar,
virou commit. O conteúdo continua no histórico — `git show 7f477fb:docs/<arquivo>`
recupera qualquer um deles.

## O que estava acontecendo

Um relatório DISC de 7 páginas, 1,6 MB, enviado na pasta de um colaborador. Clicar para
visualizar dava "Não foi possível abrir o documento". **Não era permissão, não era arquivo
corrompido, e não era o bug do `require.resolve`** — aquele já estava corrigido e no ar
desde `2ab23a1`.

O processo do Node **morria**. Instrumentando o contexto do canvas com um `Proxy`, a
última operação antes da morte era sempre a mesma:

```
drawImage(CanvasElement/2480x3508, 0,0,2480,3508, 0,0,1400,1980)
```

A imagem de fundo da página — A4 a 300 dpi — sendo reduzida para a largura de leitura. O
Skia, dentro do `@napi-rs/canvas`, **corrompia o heap** nessa redução: `SIGSEGV` em três
larguras testadas e `free(): invalid size` na quarta.

**Por que isso não aparecia em lugar nenhum:** crash nativo não é exceção de JavaScript. O
`try/catch` da rota — escrito justamente para "PDF corrompido ou protegido" — nunca
rodava, porque não sobrava processo para rodá-lo. Sem linha no log, sem 500 registrado, só
a frase genérica na tela. E, de quebra, **a aplicação caía para todos os usuários**, não só
para quem clicou.

### Tudo que foi tentado e não resolveu

| Tentativa | Resultado |
| --- | --- |
| `imageSmoothingEnabled = false` | quebra igual |
| `imageSmoothingQuality = "low"` | quebra igual |
| Rasterizar em 2480 (1:1, sem reamostragem) | quebra igual |
| Larguras 1984, 1400, 992 | quebram igual |
| Subir `@napi-rs/canvas` | **impossível** — 1.0.13 já era a última |
| `pdfjs-dist` 6 e 5.7 | **impossível** — exigem Node ≥ 22.13; a imagem tem Node 20 |
| `pdfjs-dist` 5.6.205 (o último que aceita Node 20) | quebra igual |

Confirmado também que o `sharp` instalado **não lê PDF** — a libvips dos binários prontos
vem sem o loader, por licença.

## O que foi feito

A rasterização saiu do processo do Next. `src/lib/personnel-render.ts` agora chama
**`pdfinfo` + `pdftoppm`**, do poppler, por `spawn`, com tempo-limite de 30s:

```
pdfinfo <arquivo>                        → total de páginas
pdftoppm -png -singlefile -f N -l N
         -scale-to-x 1400 -scale-to-y -1 → a página, em PNG
```

Daí para frente nada mudou: o `sharp` compõe a marca d'água e entrega webp. A assinatura
de `renderWatermarked`, a rota, o `X-Total-Pages` e o `no-store` estão iguais.

**Saíram do projeto:** `pdfjs-dist`, `@napi-rs/canvas`, os shims de
`Path2D`/`DOMMatrix`/`DOMPoint`/`ImageData`, o `shortcut:` do caminho das fontes padrão
(fonte do bug anterior) e duas entradas de `serverExternalPackages` no `next.config.mjs`.
São **543 linhas a menos** no `package-lock.json`.

**O ganho que não é sobre este arquivo:** agora um PDF que derrube o rasterizador mata um
processo filho. A promessa rejeita, o `catch` da rota responde 500, o Next segue de pé.

### Requisito novo: o poppler

É dependência do **sistema**, não do npm.

- **Contêiner:** `poppler-utils` entrou no `apt-get` do `Dockerfile`, junto do `openssl`.
- **Windows:** `winget install --id oschwartz10612.Poppler` (versão 25.07.0). Sem ele,
  `npm test` falha e o visor não abre PDF no `npm run dev`.

### Três armadilhas que custaram tempo

**`-` como destino do `pdftoppm` não é portável.** Na build para Windows ele cria um
arquivo chamado literalmente `-.png` e devolve stdout vazio. Por isso a página sai em
arquivo temporário: pasta de `mkdtemp` (permissão só do dono), apagada no `finally`.
Enquanto existe, é uma cópia **sem marca d'água** — está comentado no código. O
`pdftocairo` escreve em stdout corretamente, mas não foi testado contra o arquivo que
quebrava; se um dia quiser tirar o temporário, é por aí, e **teste com um PDF real antes**.

**Aviso na saída de erro não é falha.** O poppler reclama `No display font for 'Symbol'` e
ainda assim entrega a página inteira. Só o código de saída decide.

**PATH é herdado no nascimento do processo.** Depois de instalar o poppler, o `npm run dev`
que já estava rodando continua sem enxergá-lo — e abrir uma aba nova no VS Code não basta,
porque o editor repassa o PATH de quando ele próprio abriu. Tem de parar e subir o dev de
novo. Isso sozinho consumiu três idas e voltas.

### O visor parou de esconder o motivo

`src/components/sector-overview/personnel-document-viewer.tsx` dizia a mesma frase para
401, 403, 404 e 500. Isso atrasou o diagnóstico do começo ao fim — "sem permissão" e "o
servidor não conseguiu" são problemas de donos diferentes. Agora:

| Status | Mensagem |
| --- | --- |
| 401 / 403 | "Você não tem permissão para ver este documento." |
| 415 | "Este formato não tem visualizador. Só o Departamento Pessoal abre o arquivo." |
| 500 e o resto | "Não foi possível abrir o documento. O servidor não conseguiu preparar a imagem." |

Separar **não vaza nada**: a rota continua devolvendo 403 idêntico para "não existe" e
"não é seu", que é o que impede descobrir a existência de um arquivo por tentativa.

## Uma descoberta de leitura, não de código

**O Departamento Pessoal não usa o visor protegido.** O painel do DHO abre o documento por
`href={file.filePath}` — o link direto para `/uploads/pessoal/...`, que só DHO e Admin
alcançam. Quem passa pela rota protegida é **só o Meu Setor**.

Isso enganou o diagnóstico por uma rodada inteira: "abre pelo DP mas não pelo Meu Setor"
parecia permissão, e era ambiente. Quem for investigar esse visor de novo: **testar pelo
DP não prova nada sobre a rota.**

## O que foi verificado

- `npm run lint`, `npm run typecheck` — limpos.
- `npm test` — **402 passando** (401 + o teste novo).
- `npm run test:db` — **151 passando**.
- `npm run build` — compila; a saída compilada foi lida e `"pdftoppm"` e `pdfinfo` estão
  literais em `.next/server/app/api/documentos-pessoais/[fileId]/route.js`, sem reescrita
  do empacotador. Zero referência a `pdfjs-dist` ou `@napi-rs/canvas` em `.next/server`.
- Teste novo **mutado**: `pdfinfo` sai com código 1 no PDF quebrado e 0 no válido.
- **O arquivo real**, o mesmo que matava o servidor: **7 de 7 páginas**, 1382ms na primeira
  e 558–706ms nas demais. A página 3 (o grid DISC colorido) foi inspecionada visualmente,
  com a marca d'água legível por cima.
- No navegador, pelo Meu Setor, em desenvolvimento: abre.
- **Em produção, depois do deploy: abre.**

## O que ficou pendente

**Novo nesta rodada:**

1. **Node 20 saiu do suporte em abril de 2026** e a imagem continua nele
   (`node:20-bookworm-slim`). Foi o que impediu usar `pdfjs-dist` 6 — e vai impedir outras
   coisas. Subir para `node:22-bookworm-slim` é manutenção devida, fora do escopo da
   correção.
2. **Nenhum teste cobre o visor pelo Meu Setor de ponta a ponta** — a casa não roda teste
   de componente nem chama route handler. A decisão que a rota toma está coberta em
   `personnel-access-scope.dbtest.ts`; o caminho completo, não.
3. **O temporário do `pdftoppm`** é uma cópia sem marca d'água enquanto existe. Está em
   pasta com permissão só do dono e some no `finally`, mas é a única janela desse tipo em
   todo o fluxo.
4. **Só a página 1 foi medida em produção.** As 7 renderizaram em desenvolvimento; um PDF
   de 100 páginas ninguém tentou, e o tempo-limite de 30s nunca foi exercitado de verdade.

**Herdado e ainda em pé:** arquivos órfãos no banco (chaves de pasta antigas sem
equivalente no catálogo de 12 pastas), nenhum registro de quem viu o quê (a marca d'água
responsabiliza *depois*; um log de acesso responderia *antes*), o aviso do
`output: "standalone"` no deploy, o `Controller is already closed` em produção sem rastro,
a corrida ao excluir duas pastas ao mesmo tempo (**o item de maior risco: apaga documentos
sem erro nenhum**), colaborador sem setor caindo na cor da Logística, os gates de RBAC sem
teste, a largura de celular, e a varredura de vencimento que depende de alguém bater em
`/api/cron/evaluations` com o `CRON_SECRET`.

## Processo

Regra inviolável do projeto, declarada em 26/10/2026: antes de **qualquer** commit ou push,
rodar a bateria completa (`lint`, `typecheck`, `test`, `test:db`, `build`), apresentar o
resultado consolidado e **esperar aprovação explícita**. Foi o que se fez aqui. Commit por
iniciativa própria, nunca.

## Arquivos tocados

| Arquivo | O quê |
| --- | --- |
| `src/lib/personnel-render.ts` | `pdfinfo` + `pdftoppm` por `spawn`, temporário de `mkdtemp`, tempo-limite |
| `src/lib/personnel-render.test.ts` | Teste novo: PDF ilegível rejeita e o processo segue vivo |
| `src/components/sector-overview/personnel-document-viewer.tsx` | 403 e 500 deixaram de dizer a mesma frase |
| `next.config.mjs` | `serverExternalPackages` voltou a ser só `["baileys"]` |
| `Dockerfile` | `poppler-utils` |
| `package.json` / `package-lock.json` | `pdfjs-dist` e `@napi-rs/canvas` fora |
