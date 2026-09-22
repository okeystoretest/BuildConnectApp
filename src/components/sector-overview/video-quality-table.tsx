import { MonitorPlay } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { VideoQualityRow } from "@/lib/sector-overview-data";

function label(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function VideoQualityTable({ videos }: { videos: readonly VideoQualityRow[] }) {
  if (videos.length === 0) {
    return (
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
      {videos.map((v) => (
        <article key={v.videoId} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-foreground">{v.title}</h4>
              <p className="mt-0.5 text-[11px] text-muted">
                {v.subsector} · {v.ratings} {v.ratings === 1 ? "avaliação" : "avaliações"}
              </p>
            </div>
            <dl className="flex gap-4 text-xs">
              <div>
                <dt className="text-muted">Áudio</dt>
                <dd className="font-semibold text-foreground">{label(v.audio)}</dd>
              </div>
              <div>
                <dt className="text-muted">Imagem</dt>
                <dd className="font-semibold text-foreground">{label(v.image)}</dd>
              </div>
              <div>
                <dt className="text-muted">Clareza</dt>
                <dd className="font-semibold text-foreground">{label(v.clarity)}</dd>
              </div>
            </dl>
          </div>

          {v.comments.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {v.comments.map((c, i) => (
                <li key={i} className="rounded-lg border border-border bg-surface-2 p-2 text-xs">
                  <span className="text-muted">{c.author}: </span>
                  <span className="text-foreground">{c.text}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
