"use client";

import { useRouter } from "next/navigation";
import { VideoModal } from "@/components/sector/video-modal";
import type { PendingItem } from "@/lib/pending-content";
import type { VideoItem } from "@/types/sector";

/**
 * Na tela do setor quem instancia o `VideoModal` é o `VideoCard`. Aqui não há
 * card, então este componente é o dono do player em "Meu Progresso" — montado
 * por `PendingContent`, e não pela linha da lista: a linha some no instante em
 * que a resposta é enviada (ver o comentário lá).
 *
 * `comprehension` é sempre verdadeiro: só entra em pendências o conteúdo de
 * subsetor PADRAO, que é exatamente onde a pergunta existe.
 */
export function PendingItemPlayer({
  item,
  open,
  onClose,
}: {
  item: PendingItem;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const video: VideoItem = {
    id: item.id,
    title: item.title,
    // Se estivesse assistido não estaria na lista de pendências.
    watched: false,
    ended: item.ended,
    filePath: item.filePath,
    thumbnailPath: item.thumbnailPath,
    transcriptText: item.transcriptText,
  };

  return (
    <VideoModal
      video={video}
      open={open}
      onClose={onClose}
      comprehension
      /*
       * `router.refresh()`, não `window.location.reload()`. A recarga da
       * página inteira rodava no DESMONTE do modal — isto é, no mesmo quadro
       * em que as estrelas apareciam — e era a segunda metade do bug do
       * formulário que piscava. Responder já revalida a rota no servidor;
       * aqui basta reler o que mudou por fora dela (o vídeo que chegou ao
       * fim mas não foi respondido).
       */
      onChanged={() => router.refresh()}
    />
  );
}
