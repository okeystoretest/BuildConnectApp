"use client";

import { WelcomeVideoCard } from "./welcome-video-card";
import { WelcomeVideoGate } from "./welcome-video-gate";
import type { SectorWelcomeVideo } from "@/lib/welcome-video-data";

/**
 * Ponto único do vídeo de boas-vindas numa página de setor.
 *
 * Junta as duas metades da funcionalidade para que cada página precise
 * renderizar um componente só, logo abaixo do cabeçalho:
 *  - o MODAL obrigatório, quando o usuário ainda não assistiu;
 *  - o CARD de gestão (enviar/trocar/remover), que só aparece para quem tem
 *    permissão de enviar conteúdo.
 *
 * Setor sem vídeo configurado não bloqueia ninguém — só o card aparece, para
 * o gestor saber que a vaga existe.
 */
export function SectorWelcomeVideo({ data }: { data: SectorWelcomeVideo | null }) {
  if (!data) return null;

  return (
    <>
      {data.pending && data.path && (
        <WelcomeVideoGate
          slug={data.subsectorSlug}
          sectorLabel={data.subsectorLabel}
          path={data.path}
          title={data.title}
        />
      )}

      <WelcomeVideoCard
        slug={data.subsectorSlug}
        sectorLabel={data.subsectorLabel}
        path={data.path}
        title={data.title}
        watchedCount={data.watchedCount}
      />
    </>
  );
}
