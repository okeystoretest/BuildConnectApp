"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AnonymousReportModal } from "./anonymous-report-modal";

/**
 * Porta de entrada da denúncia anônima na TELA DE LOGIN.
 *
 * Fica fora do card de autenticação, com destaque próprio: quem precisa
 * denunciar não deveria ter de entrar na plataforma antes — nem parecer que
 * precisa.
 */
export function AnonymousReportLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        <ShieldCheck className="h-4 w-4" />
        Denúncia anônima
      </button>

      <AnonymousReportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
