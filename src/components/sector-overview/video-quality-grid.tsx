import { MonitorPlay, SearchX, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import type { VideoQualityRow } from "@/lib/sector-overview-data";

function label(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Uma das três notas do vídeo. */
function Criterion({ name, value }: { name: string; value: number | null }) {
  return (
    <div className="min-w-0 text-center">
      <dt className="truncate text-[10px] uppercase tracking-wide text-muted">{name}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{label(value)}</dd>
    </div>
  );
}

function VideoCard({ video }: { video: VideoQualityRow }) {
  const rated = video.average !== null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {/* A miniatura é o elemento principal: quem procura "qual vídeo refazer"
          reconhece o conteúdo pela imagem antes de ler o título. */}
      <div className="bc-stripes relative flex aspect-video w-full items-center justify-center bg-surface-2">
        {video.thumbnailPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailPath}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <VideoOff className="h-6 w-6 text-muted" />
        )}

        {/* A média sobre a miniatura, pill branca como o selo "Assistido" —
            é o número que decide a ordem da lista, e tem de ser lido de longe. */}
        <span
          className={cn(
            "absolute right-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-md ring-1 ring-black/10",
            rated ? "bg-white text-slate-900" : "bg-surface-3 text-muted",
          )}
        >
          {rated ? `${label(video.average)}/5` : "sem avaliação"}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h4 className="truncate text-sm font-semibold text-foreground">{video.title}</h4>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {video.subsector} · {video.ratings} {video.ratings === 1 ? "avaliação" : "avaliações"}
        </p>

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3 [&>*]:mt-3">
          <Criterion name="Áudio" value={video.audio} />
          <Criterion name="Imagem" value={video.image} />
          <Criterion name="Clareza" value={video.clarity} />
        </dl>
      </div>
    </article>
  );
}

/**
 * Os vídeos do setor, um card por vídeo, na mesma identidade dos cards de
 * colaborador.
 *
 * Ordenados do PIOR avaliado para o melhor, e vídeo sem avaliação vai para o
 * fim: ele não é ruim, é desconhecido — mandá-lo para o topo diria que o
 * silêncio é a pior nota.
 */
export function VideoQualityGrid({
  videos,
  filtered,
}: {
  videos: readonly VideoQualityRow[];
  filtered?: boolean;
}) {
  if (videos.length === 0) {
    return filtered ? (
      <EmptyState
        icon={<SearchX className="h-5 w-5" />}
        title="Nenhum vídeo com esse título"
        description="Ajuste a busca para ver os vídeos deste setor."
      />
    ) : (
      <EmptyState
        icon={<MonitorPlay className="h-5 w-5" />}
        title="Nenhum vídeo neste setor"
        description="Quando houver vídeos publicados, as avaliações dos colaboradores aparecem aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Ordenados do pior avaliado para o melhor. Vídeo sem avaliação aparece por último — não é
        ruim, é desconhecido.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {videos.map((v) => (
          <VideoCard key={v.videoId} video={v} />
        ))}
      </div>
    </div>
  );
}
