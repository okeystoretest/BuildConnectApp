"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/providers/navigation-provider";

/**
 * Transição de entrada do conteúdo a cada troca de setor/subsetor.
 *
 * A `key` no pathname força a remontagem do wrapper — e só dele —, o que
 * reexecuta a animação de entrada. Enquanto o servidor responde, o conteúdo
 * anterior continua na tela, apenas atenuado: é o que separa "trocar de setor"
 * de "recarregar a página".
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { pending } = useNavigation();

  return (
    <div
      key={pathname}
      className={cn(
        "animate-page-in transition-opacity duration-200",
        pending && "opacity-50",
      )}
    >
      {children}
    </div>
  );
}
