# Instruções em Vídeo — alterações de 16/09/2026

Commits `5084130` e `dcea063` na `main`.

## O que mudou

### 1. Miniatura (thumbnail)
- Capturada **no navegador** na hora do envio: um quadro do próprio vídeo (~1 s) vira JPEG e sobe junto com o arquivo.
- O servidor converte para `.webp` (sharp) e grava em `Video.thumbnailPath`.
- O card mostra a miniatura com o botão de play por cima; o player usa `poster`.
- Sem miniatura (vídeos antigos ou codec que o navegador não decodifica), o card mantém o placeholder listrado.

### 2. MKV
- `.mkv` já era aceito, mas chegava com MIME vazio no Firefox e no Explorador do Windows e era recusado. Agora passa pela extensão.
- **Reprodução**: Chrome e Edge tocam MKV (H.264/AAC); Firefox e Safari não. Não há transcodificação no servidor (sem ffmpeg).

### 3. Envio em lote
- Até **15 vídeos** por vez, em qualquer aba de vídeo (Instruções, Vídeos da Coleção, Workshop).
- Sobem **um por vez**, cada um na própria requisição — o orçamento de tempo (300 s) vale por vídeo, não pelo lote.
- Título sugerido pelo nome do arquivo (sem extensão, `_`/`-` viram espaço), editável antes do envio.
- Progresso por item; erro num item não trava os demais (botão "tentar de novo").
- Teto por vídeo: **135 MB**. Corpo da requisição: 145 MB (vídeo + miniatura + folga).

### 4. Instrução Escrita — removida
- Coluna `Video.instructionPath` derrubada (migration `20260916120000_video_thumbnail_drop_instruction`).
- Saíram: regra de storage, teto de 25 MB, campo no envio, botão no player e selo no card.
- Arquivos já gravados em disco ficam órfãos; só a coluna saiu.

### 5. Transcrição só na edição
- O modal de envio não tem mais o campo de transcrição.
- A tela **Editar conteúdo** (lápis do card) passou a salvar de verdade: título, tags e transcrição (enviar / substituir / remover). TXT, MD, VTT ou SRT, até 5 MB.
- **Excluir** também passou a funcionar: remove o registro (progresso cai em cascata) e depois os arquivos — vídeo, miniatura e transcrição.

### 6. Filtros
- As pílulas de filtro nascem das **tags atribuídas na edição** dos vídeos da aba — não existe mais filtro solto.
- Um vídeo aparece se tiver **qualquer** tag ativa. Vale também na aba de Instruções da TI.

## Deploy
- Nada manual: `docker-entrypoint.sh` roda `prisma migrate deploy` ao subir.
- Local usa `prisma db push` (sem histórico de migrations).

## Ponto de atenção
- A 4,8 Mbps medidos em produção, 135 MB levam ~225 s dos 300 s do `requestTimeout` do Node. Rede mais lenta que a medida pode estourar o tempo num vídeo no teto (502 com `ECONNRESET` mudo). Para subir o teto, o caminho é `requestTimeout` maior ou envio em pedaços — não editar o número.

## Arquivos principais
| Arquivo | Papel |
|---|---|
| `src/components/sector/video-batch-upload-modal.tsx` | Modal de envio em lote |
| `src/lib/video-batch.ts` | Regras do lote (título, validação, fila sequencial) |
| `src/lib/video-thumbnail.ts` | Captura da miniatura no navegador |
| `src/lib/video-filters.ts` | Pílulas a partir das tags e filtragem |
| `src/lib/sector-actions.ts` | `uploadSectorVideo`, `updateSectorVideo`, `deleteSectorVideo` |
| `src/components/sector/media-edit-modal.tsx` | Edição: título, tags, transcrição |
| `src/lib/storage/limits.ts` | Tetos (vídeo 135 MB, miniatura 2 MB, corpo 145 MB) |
