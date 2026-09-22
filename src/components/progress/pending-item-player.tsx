"use client";

import { useState } from "react";
import { VideoModal } from "@/components/sector/video-modal";
import type { PendingItem } from "@/lib/pending-content";
import type { VideoItem } from "@/types/sector";

/**
 * Na tela do setor quem instancia o `VideoModal` é o `VideoCard`. Aqui não há
 * card, então este componente é o dono do player em "Meu Progresso".
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
      // Responder muda o progresso: a página inteira precisa ser relida.
      onChanged={() => window.location.reload()}
    />
  );
}

/** Qual item está com o player aberto. Um de cada vez. */
export function usePendingPlayer() {
  const [openId, setOpenId] = useState<string | null>(null);
  return {
    openId,
    open: (id: string) => setOpenId(id),
    close: () => setOpenId(null),
  };
}
