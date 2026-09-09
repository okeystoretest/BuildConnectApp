"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { OnboardingModal } from "./onboarding-modal";

/** Rotas que nunca exibem o vídeo obrigatório. */
const EXEMPT_PREFIXES = ["/login"];

export interface OnboardingGateProps {
  /** Caminho público do vídeo publicado. Ausente = nada a exibir. */
  path: string | null;
  title: string | null;
  /** Resolvido no servidor: existe vídeo e este usuário ainda não assistiu. */
  pending: boolean;
}

/**
 * Vídeo obrigatório de boas-vindas da plataforma. Montado no layout raiz:
 * bloqueia qualquer rota até a conclusão.
 *
 * O estado deixou de morar no `localStorage`. Ele valia por DISPOSITIVO —
 * trocar de navegador, limpar o site ou abrir uma janela anônima fazia o vídeo
 * voltar, e assistir num aparelho não valia no outro. Agora quem responde é o
 * servidor, pela coluna `User.platformWelcomeWatchedAt`, e a validação
 * acompanha a PESSOA.
 *
 * Some com isso o estado `null` de "ainda lendo o storage": o servidor já
 * entrega a resposta pronta na primeira pintura, sem piscar.
 */
export function OnboardingGate({ path, title, pending }: OnboardingGateProps) {
  const pathname = usePathname();
  const [done, setDone] = useState(false);

  const exempt = EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (exempt || done || !pending || !path) return null;

  return <OnboardingModal open path={path} title={title} onComplete={() => setDone(true)} />;
}
