"use client";

import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Resultados de Treinamento — notas dos questionários vinculados aos vídeos.
 * A captação dos questionários é um passo futuro; por ora, estado vazio
 * informativo (nenhum dado inventado).
 */
export function TrainingResultsPanel() {
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Notas obtidas pelos colaboradores nos questionários vinculados aos vídeos. Cada questão vale
        10 pontos (acerto) ou 0 (erro).
      </p>
      <EmptyState
        icon={<ClipboardCheck className="h-5 w-5" />}
        title="Nenhum resultado ainda"
        description="Os resultados aparecem aqui quando colaboradores respondem os questionários vinculados aos vídeos de treinamento."
      />
    </>
  );
}
