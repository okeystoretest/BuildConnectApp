"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import type { StoryChapter } from "@/lib/company-info";

export interface StoryTimelineProps {
  chapters: readonly StoryChapter[];
}

/**
 * "Nossa história" como linha do tempo vertical.
 *
 * Linha do tempo, e não um bloco de texto corrido, porque o conteúdo É uma
 * sequência — infância, 2014, 2018, 2019, hoje — e o marco à esquerda deixa a
 * trajetória legível de relance, antes de ler qualquer parágrafo.
 *
 * Tudo visível de uma vez, sem sanfona. A tentação era esconder cada capítulo
 * atrás de um clique para "ficar interativo", mas isto é a primeira coisa que
 * um convidado lê sobre a empresa: esconder obriga a descobrir, e quem está
 * sendo integrado não sabe que há o que descobrir. A interação fica onde
 * ajuda — a foto abre ampliada.
 *
 * As fotos são opcionais, capítulo a capítulo (ver `COMPANY_STORY`). Sem
 * nenhuma, isto continua sendo uma linha do tempo inteira e bem formada; o
 * texto só ocupa a largura toda.
 */
export function StoryTimeline({ chapters }: StoryTimelineProps) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  if (chapters.length === 0) return null;

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-foreground">Nossa história</h3>
      <p className="mb-5 text-xs text-muted">
        De uma máquina de costura em Maracanaú ao showroom em São Paulo.
      </p>

      <ol className="relative space-y-6 border-l border-border pl-6">
        {chapters.map((chapter, index) => (
          <li key={chapter.marker + index} className="relative">
            {/* O ponto fica sobre a linha vertical, não ao lado dela. */}
            <span
              aria-hidden
              className="absolute -left-[1.655rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2 bg-primary"
            />

            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {chapter.marker}
            </p>
            <h4 className="mt-0.5 text-sm font-semibold text-foreground">{chapter.title}</h4>

            <div className="mt-2 gap-4 sm:flex">
              <p className="flex-1 text-[13px] leading-relaxed text-muted">{chapter.body}</p>

              {chapter.photo && (
                <button
                  type="button"
                  onClick={() => setZoom(chapter.photo ?? null)}
                  aria-label={`Ampliar foto: ${chapter.photo.alt}`}
                  className="focus-ring group mt-3 block shrink-0 overflow-hidden rounded-xl border border-border sm:mt-0 sm:w-44"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem
                      institucional servida de `public/`, sem otimizador. */}
                  <img
                    src={chapter.photo.src}
                    alt={chapter.photo.alt}
                    loading="lazy"
                    className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] sm:h-28"
                  />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <ImageLightbox
        open={zoom !== null}
        src={zoom?.src ?? ""}
        alt={zoom?.alt ?? ""}
        onClose={() => setZoom(null)}
      />
    </section>
  );
}
