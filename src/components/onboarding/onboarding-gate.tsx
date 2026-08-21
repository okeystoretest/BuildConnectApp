"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OnboardingModal } from "./onboarding-modal";

const STORAGE_KEY = "bc-onboarding-done";

/** Rotas que nunca exibem o vídeo obrigatório. */
const EXEMPT_PREFIXES = ["/login"];

/**
 * Vídeo obrigatório de boas-vindas. Montado no layout raiz: bloqueia
 * qualquer rota da plataforma até a conclusão.
 * Nesta fase o estado mora no localStorage; depois vira flag do usuário no banco.
 */
export function OnboardingGate() {
  const pathname = usePathname();
  const [done, setDone] = useState<boolean | null>(null);

  const exempt = EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    try {
      setDone(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDone(false);
    }
  }, []);

  function handleComplete() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Sem persistência disponível; segue liberando a sessão atual.
    }
    setDone(true);
  }

  // `null` = ainda lendo o storage; não pisca o modal antes de saber.
  if (exempt || done === null || done) return null;

  return <OnboardingModal open onComplete={handleComplete} />;
}
