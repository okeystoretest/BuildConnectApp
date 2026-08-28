"use client";

import { useEffect, useState } from "react";
import { archiveCountdownLabel, msUntilArchive } from "./archive-window";

/**
 * Contagem regressiva até o registro encerrado sair do quadro.
 *
 * Retorna `null` na primeira renderização — inclusive na do servidor — porque
 * o rótulo depende do relógio: calculá-lo durante o render faria o HTML do
 * servidor divergir do cliente na hidratação. Depois de montado, atualiza a
 * cada 30s, o suficiente para um contador em minutos.
 */
export function useArchiveCountdown(closedAt: string | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!closedAt) {
      setLabel(null);
      return;
    }
    const tick = () => setLabel(archiveCountdownLabel(msUntilArchive(closedAt)));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [closedAt]);

  return label;
}
