# Vitrine, Instruções em Vídeo, DHO e compartilhamento — alterações de 18/09/2026

Commits `8398578` a `3eb891c` na `main` (11 commits, 40 arquivos). Plano completo em `docs/superpowers/plans/2026-09-18-vitrine-instrucoes-dho-compartilhamento.md`.

## O que mudou

### 1. Instruções em Vídeo — ordem alfabética
- A aba lista por **título**, ignorando caixa e acento, com números como números ("Módulo 2" antes de "Módulo 10").
- Só nos subsetores **PADRAO**. Coleção e Workshop (vitrines) seguem a ordem de envio.
- Regra pura em `src/lib/instrucoes-video.ts` (`sortInstrucoes`), aplicada em `getSectorContent`.

### 2. Instruções em Vídeo — filtros sempre à vista
- O botão **"Filtro"** saiu da barra de busca.
- As pílulas de tag aparecem sempre que há ao menos uma tag em uso, **para todos os papéis** (antes só Gestor/Admin viam o botão). Sem tag, não aparece nada.
- Vale na página de setor e na aba Instruções da TI.

### 3. Construtor de Formulários (DHO) — sem "Seção"
- O bloco **Seção** foi removido do modelo, não só da tela: `FormSection` não existe mais; `FormQuestion` liga direto ao `Form` (`formId`).
- Construtor: lista única de perguntas + "Adicionar pergunta". Resposta (`/minhas-avaliacoes`): uma página só, "Enviar" libera quando todas as obrigatórias estão respondidas.
- Migration `20260918100000_forms_drop_sections`: copia `formId` da seção para a pergunta e **renumera a ordem** (seção → pergunta → id) antes de derrubar a coluna e a tabela. Perguntas, opções, atribuições e respostas são preservadas; títulos e descrições de seção são descartados.
- Provada num banco descartável com formulário de várias seções e resposta gravada; `prisma migrate diff` sem diferença contra o schema.

### 4. Vitrine — aba "Material de Apoio"
- Nova aba, por último, nas vitrines (OKEY, Lov Club): documentos e apresentações. Reusa o modelo `Document` — a vitrine não tem aba Documentos e o progresso já ignora tudo que é VITRINE.
- **`.ppt`/`.pptx` aceitos** no envio (MIME ou extensão, como o `.mkv`), no enum `FileKind` (migration `20260918110000_filekind_pptx`) e no servidor de arquivos (`/uploads`). Teto: 50 MB, igual aos demais documentos.
- **Visualizar / Baixar passaram a funcionar** — na aba Documentos os botões não faziam nada e o item nem carregava o caminho do arquivo. PDF abre em nova aba; DOCX/XLSX/PPTX só baixam (o navegador não renderiza Office; não há conversão no servidor). O download sai com o nome do documento, não com o nome aleatório do disco.
- O RH também aceita `.pptx` no envio de documentos.

### 5. Compartilhamento de vídeo entre subsetores
- Na tela **Editar conteúdo** de uma Instrução em Vídeo, **ADMIN** marca com quais subsetores PADRAO o vídeo é compartilhado. Gestor não vê o campo (e o servidor ignora se vier forjado).
- **Um arquivo, uma linha `Video`, N linhas `VideoShare`** (migration `20260918120000_video_share`). Nada é copiado em disco.
- No subsetor de destino o vídeo aparece nas Instruções com o selo do setor de origem, **sem lápis/lixeira**. Reproduz, libera a pergunta de compreensão e grava a resposta normalmente.
- **Não conta no progresso do destino** (Meu Progresso, Início, barra do setor, Histórico do DHO). O progresso é do subsetor dono.
- Excluir no dono apaga os compartilhamentos em cascata e só aí o arquivo sai do disco. Do destino não há como editar nem excluir, mesmo forjando a chamada.
- Destinos são validados no servidor (existem e são PADRAO); ids inválidos são descartados sem derrubar a edição.

## Deploy
- Nada manual: `docker-entrypoint.sh` roda `prisma migrate deploy`. Três migrations novas, aplicadas em ordem.
- **Faça backup do banco antes**: `forms_drop_sections` é irreversível pelo repositório.
- Local segue com `prisma db push`.

## Verificação feita
- `typecheck`, `lint`, 225 testes unitários, 39 testes de banco, `next build` completo — tudo verde.
- Cada bloco passou por revisão independente; revisão final do branch inteiro: MERGEABLE.
- **Não foi feito** smoke test no navegador. Ao subir o `dev`, conferir: construtor DHO (criar/duplicar/mover/salvar; abrir formulário antigo de várias seções), Material de Apoio (`.pptx` e `.pdf`), compartilhamento (marcar, ver no destino, desmarcar, excluir no dono).

## Fora do escopo (de propósito)
- Visualizar DOCX/PPTX dentro do app (exigiria LibreOffice no container ou serviço externo).
- Vídeo compartilhado contando no progresso do destino.
- Compartilhar Coleção/Workshop ou documentos.

## Ponto de atenção
- Resposta de compreensão de vídeo compartilhado é avaliada pelo **gestor do colaborador que respondeu**, não pelo setor dono do vídeo — comportamento já existente em `video-comprehension-scope.ts`. Confirmar se é o desejado.

## Arquivos principais
| Arquivo | Papel |
|---|---|
| `src/lib/instrucoes-video.ts` | `sortInstrucoes` |
| `src/components/sector/content-toolbar.tsx` | Barra de busca sem o botão Filtro |
| `prisma/migrations/20260918100000_forms_drop_sections/` | Migration com cópia de dados |
| `src/lib/forms/core.ts`, `actions.ts`, `data-core.ts` | Formulário = perguntas direto |
| `src/components/forms/form-builder.tsx`, `form-response-modal.tsx` | Construtor plano; resposta em página única |
| `src/lib/storage/files.ts` | Regra `document` com `.ppt/.pptx` |
| `src/components/sector/document-grid.tsx` | Visualizar (PDF) / Baixar funcionais |
| `src/components/sector/sector-page.tsx` | Aba `material` na Vitrine |
| `src/lib/video-share.ts` | `mergeSharedVideos` (próprios + compartilhados, sem repetir) |
| `src/lib/sector-data.ts` | Carrega shares, `sharedFrom`/`sharedWith`, ordenação |
| `src/lib/sector-actions.ts` | `listVideoShareTargets`; sync dos shares em `updateSectorVideo` |
| `src/components/sector/media-edit-modal.tsx`, `video-card.tsx` | Campo "Compartilhar com"; selo de origem no destino |
