import { cn } from "@/lib/utils";

/**
 * Um dos cinco blocos numerados do canvas.
 *
 * O número em círculo é do impresso, e não é enfeite: é por ele que quem
 * conhece a folha se localiza na tela. O rótulo segue a tipografia do
 * original — maiúsculas pequenas e espaçadas —, que também é o que deixa o
 * cabeçalho ocupar uma linha em vez de um parágrafo.
 */
export function CanvasBlock({
  numero,
  titulo,
  acao,
  className,
  children,
}: {
  numero: number;
  titulo: string;
  /** Botão opcional alinhado à direita do cabeçalho. */
  acao?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface-1 p-3", className)}>
      <header className="mb-2.5 flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 text-[11px] font-semibold text-muted"
        >
          {numero}
        </span>
        <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {titulo}
        </h3>
        {acao}
      </header>
      {children}
    </section>
  );
}

/** Rótulo de campo na tipografia do canvas. */
export function FieldLabel({
  htmlFor,
  children,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "block text-[10px] font-medium uppercase tracking-[0.1em] text-muted",
        className,
      )}
    >
      {children}
    </label>
  );
}
