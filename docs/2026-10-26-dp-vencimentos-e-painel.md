# Departamento Pessoal — vencimento de documentos e painel

26 de outubro de 2026

Continua `docs/2026-10-23-departamento-pessoal.md`, que descreve a ferramenta por baixo
destas mudanças. **Nada aqui foi commitado ainda** — está tudo na árvore de trabalho.

## O que mudou na tela

| Antes | Agora |
| --- | --- |
| Trilha de progresso com checkbox acima do mosaico | Trilha removida; o checkbox foi para dentro do ladrilho, ao lado do `+` |
| Pasta vermelha quando vazia, neutra quando tem arquivo | Quatro estados: **Pendente** (vazia), **Vencido**, **Cuidado** (a 30 dias), **Em dia** |
| Criar pasta pedia só o nome | Pergunta "Esse documento vence?" e, no "Sim", a data |
| Envio de arquivo pedia só o arquivo | Aceita a data de vencimento; exige a data nova se a pasta já vence |
| Aba abria direto na lista de colaboradores | Abre com quatro contadores clicáveis que filtram a lista |

O checkbox continua **derivado e não clicável**, pela razão do documento anterior: a pasta
está entregue porque tem arquivo. O invólucro dele é `pointer-events-none`, então clicar
em cima abre a pasta em vez de virar um canto morto do ladrilho.

## Como o vencimento funciona

Só pasta que vence tem linha no banco — `PersonnelFolderExpiry`, chave composta
`(ownerId, folder)`, a mesma de `PersonnelFile`. As 11 pastas do catálogo são constante em
código e não têm linha nenhuma, então a data precisava de tabela própria.

O estado sai de uma função pura, `folderStatus(temArquivo, vencimento, hoje)`, em
`src/lib/personnel-expiry.ts`:

- sem arquivo → **pendente**, mesmo com vencimento gravado (não há o que vencer);
- com arquivo e sem vencimento → **em dia**;
- vencimento no passado → **vencido**;
- vencimento dentro de 30 dias → **cuidado**;
- mais longe que isso → **em dia**.

O módulo inteiro trabalha em `"aaaa-mm-dd"`, nunca em `Date`. A coluna é `DATE`, o Prisma a
devolve como meia-noite UTC, e meia-noite UTC lida no fuso de Brasília cai no **dia
anterior** — um ASO que vence dia 1º apareceria vencido no dia 30. Dia contra dia não tem
fuso para errar. `isoDay()` lê a coluna pelo calendário UTC; `todayBR()` lê hoje pelo
calendário de Brasília; os dois se comparam como texto.

O **reajuste é pelo envio**: pasta que já vence recusa o arquivo sem a data nova. Sem essa
exigência o documento novo herdaria o vencimento do antigo, e a pasta ficaria vermelha com
um ASO em dia dentro dela.

O card do colaborador mostra o **pior** estado das pastas dele — um estado por pessoa, é
assim que os contadores do painel fecham com o total da lista.

## A notificação

`notifyPersonnelExpiring()` entrou na rota de varredura que já existia
(`GET /api/cron/evaluations`, protegida por `CRON_SECRET`). Nenhuma rota nova, nenhum
agendador novo.

Ela busca as linhas que vencem nos próximos 30 dias, descarta dono inativo, descarta o que
já foi avisado para aquela data (`notifiedFor`) e **passa o resto pelo mesmo
`folderStatus()` da tela**. Essa última peneira foi a correção de um erro real da primeira
versão: a varredura avisou "perto do vencimento" sobre uma pasta vazia, que a tela chama de
Pendente. Notificação contradizendo a tela é pior que notificação nenhuma.

Vai para Admin e Gestor lotado no DHO — o mesmo recorte de `canAdministerDho`, escrito como
consulta. Um documento novo zera o `notifiedFor` e rearma o aviso sozinho.

## Decisões que valem lembrar

**Os 30 dias são escolha minha, não pedido seu.** Constante única, `EXPIRY_WARNING_DAYS`.
É o prazo em que o DHO agenda exame, cobra e recebe de volta; avisar na véspera não dá tempo,
avisar com três meses deixa a pasta amarela mais tempo do que verde.

**Pendente ganha de Vencido** quando a pessoa tem os dois. Documento que nunca chegou é o
furo maior; documento vencido pelo menos existe.

**Pendente e Vencido são os dois vermelhos.** Distinguem-se pela palavra, não pelo tom —
inventar um terceiro vermelho só faria o olho adivinhar qual é o pior.

**Os contadores contam o recorte do setor, não o da busca.** Se contassem o resultado da
busca, os números tremeriam a cada letra digitada e deixariam de ser um painel.

**O vencimento das pastas do catálogo se marca no envio.** Ninguém "cria" a pasta do ASO —
ela já existe. Sem o campo opcional na tela de envio, o recurso não alcançaria justamente os
documentos que vencem de verdade.

## O que ficou pendente

**Novo nesta rodada:**

1. **A varredura depende de alguém chamá-la.** Sem `CRON_SECRET` configurado e um disparo
   externo (crontab, PM2, o agendador do Easypanel) batendo em `/api/cron/evaluations`, as
   cores funcionam e o sino nunca toca. É configuração de produção, não código.
2. **Não dá para "desligar" o vencimento de uma pasta.** Marcou que vence, toda remessa nova
   passa a exigir data. Desfazer só excluindo e recriando a pasta — o que apaga os arquivos.
3. **A migration não foi aplicada em produção.** `prisma migrate deploy` antes de subir, ou
   a tela quebra na primeira consulta à tabela nova.
4. **O envio de arquivo não foi testado ponta a ponta no navegador.** O seletor de arquivo é
   diálogo nativo do sistema e trava a automação. A validação da data no servidor está
   coberta por tipos, lint e build; o upload em si, não.

**Herdado do documento anterior, nada disso foi corrigido:** a corrida ao excluir duas
pastas ao mesmo tempo (item 1 de lá, o de maior risco — apaga documentos sem erro nenhum),
colaborador sem setor caindo na cor da Logística, a ação de renomear bloco sem teste, os
gates de RBAC sem teste, as linhas de `Document` órfãs em produção e a largura de celular.

## O que foi verificado

- `npm run lint` limpo.
- `npm test` — 377 testes, 377 passando. Inclui 9 novos em `personnel-expiry.test.ts`,
  entre eles o que prova que 02:30 UTC do dia 24 ainda é dia 23 em Brasília.
- `npm run test:db` — 140 testes, 140 passando. Inclui um caso novo que leva uma pasta de
  "em dia" a "cuidado" e a "vencido", e confere que o dia gravado é o dia lido.
- `npm run build` compila.
- No navegador, em `localhost:3100`: as quatro cores, os contadores filtrando a lista, e um
  par semeado de +10/−5 dias exibindo "Vence em 02/11/2026" e "Vencido em 18/10/2026" a
  partir do dia 23 — sem erro de um dia.
- A varredura rodada de verdade contra o banco de desenvolvimento: avisou uma vez e, na
  chamada seguinte, zero. Os dados de teste foram removidos depois.

## Arquivos

| Arquivo | O quê |
| --- | --- |
| `prisma/schema.prisma` + `prisma/migrations/20261023150000_dp_vencimento/` | A tabela `PersonnelFolderExpiry` |
| `src/lib/personnel-expiry.ts` (+ `.test.ts`) | As regras puras, sem Prisma |
| `src/lib/personnel-data.ts`, `src/types/hr.ts` | Estado e contadores na leitura |
| `src/lib/personnel-actions.ts` | Grava, exige e apaga o vencimento |
| `src/lib/notifications/notify.ts`, `src/app/api/cron/evaluations/route.ts` | A varredura diária |
| `src/components/hr/personnel-panel.tsx` | Painel, cores, checkbox, pergunta do vencimento |
| `src/components/sector/file-upload-modal.tsx` | Um `children` para o campo de data |
