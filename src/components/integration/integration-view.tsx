"use client";

import { useRouter } from "next/navigation";
import { FileText, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/layout/logo";
import { CompanyValues } from "@/components/home/company-values";
import { CultureCard } from "@/components/home/culture-card";
import { WelcomeGate } from "./welcome-gate";
import { FilmBlock } from "./film-block";
import { StoryTimeline } from "./story-timeline";
import type { StoryChapter } from "@/lib/company-info";
import type { CompanyValue } from "@/types/content";
import type { AttemptSummary, LibraryItem, TrailFilm } from "@/types/integration";

export interface IntegrationViewProps {
  token: string;
  /** Nome cadastrado no convite — confirmado na chegada, nunca digitado. */
  guestName: string;
  /** Já confirmou a entrada nesta sessão. */
  entered: boolean;
  films: TrailFilm[];
  /** Última tentativa por filme, para o bloco explicar um retorno. */
  attempts: Record<string, AttemptSummary>;
  library: LibraryItem[];
  values: readonly CompanyValue[];
  culture: string;
  /** Vazio enquanto o PDF institucional não chegou — a seção some. */
  story: readonly StoryChapter[];
}

/**
 * A página que o convidado vê.
 *
 * Trilha TRANCADA: os filmes saem na ordem definida pelo DHO e o seguinte só
 * abre quando o anterior é concluído — assistido até o fim e, havendo
 * questionário, respondido com nota 7 ou mais. O cadeado aqui é cortesia:
 * quem decide é o servidor, na mesma `getTrail` que alimenta esta tela e na
 * rota que entrega o arquivo.
 */
export function IntegrationView({
  token,
  guestName,
  entered,
  films,
  attempts,
  library,
  values,
  culture,
  story,
}: IntegrationViewProps) {
  const router = useRouter();
  const concluded = films.filter((f) => f.state === "CONCLUIDO").length;

  return (
    <div className="min-h-screen bg-surface-2">
      {!entered && (
        <WelcomeGate token={token} guestName={guestName} onEntered={() => router.refresh()} />
      )}

      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-5">
          <LogoMark className="h-9 w-9" />
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight">
              <span className="text-foreground">Build.</span>
              <span className="text-primary">Connect</span>
            </p>
            <p className="text-xs text-muted">Olá, {guestName}</p>
          </div>
          {films.length > 0 && entered && (
            <p className="ml-auto shrink-0 text-xs text-muted">
              {concluded} de {films.length} filmes concluídos
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-10 px-4 py-8">
        <StoryTimeline chapters={story} />

        <CompanyValues values={values} />
        <CultureCard text={culture} />

        <section>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Trilha de filmes</h3>
          <p className="mb-4 text-xs text-muted">
            Assista na ordem. Ao fim de cada filme, o questionário aparece logo abaixo — acerte
            ao menos 70% para liberar o próximo.
          </p>

          {films.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              Os filmes ainda não foram publicados.
            </p>
          ) : (
            <ol className="space-y-3">
              {films.map((film, index) => (
                <FilmBlock
                  key={film.id}
                  film={film}
                  position={index + 1}
                  lastAttempt={attempts[film.id]}
                  entered={entered}
                />
              ))}
            </ol>
          )}
        </section>

        {library.length > 0 && (
          <section>
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Materiais complementares
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {library.map((item) => (
                <a
                  key={item.id}
                  href={entered ? `/api/integracao/arquivo/${item.id}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!entered}
                  className={cn(
                    "focus-ring flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors",
                    entered ? "hover:border-border-strong" : "pointer-events-none opacity-60",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    {item.kind === "VIDEO" ? (
                      <PlayCircle className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 text-sm font-medium text-foreground">{item.title}</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-[11px] text-muted">
        © 2026 Build.Connect · Página de integração
      </footer>
    </div>
  );
}
