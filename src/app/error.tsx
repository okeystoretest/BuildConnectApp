"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Substituir por logging real (Sentry/pino) na integração.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-danger/15 text-danger">
        <TriangleAlert className="h-5 w-5" />
      </span>
      <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted">
        Não foi possível carregar esta página. Tente novamente; se persistir, abra um chamado para a
        TI.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-muted">Código: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="focus-ring mt-6 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        <RotateCcw className="h-4 w-4" />
        Tentar novamente
      </button>
    </div>
  );
}
