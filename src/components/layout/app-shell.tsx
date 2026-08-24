"use client";

import { cn } from "@/lib/utils";
import { useSidebar } from "@/providers/sidebar-provider";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { RouteTransition } from "./route-transition";

export interface AppShellProps {
  eyebrow: string;
  title: string;
  /**
   * Amplia o container para ferramentas que se beneficiam de largura — o
   * calendário do Cronograma, por exemplo. Continua com teto para não
   * esticar demais em telas ultralargas.
   */
  wide?: boolean;
  children: React.ReactNode;
}

export function AppShell({ eyebrow, title, wide = false, children }: AppShellProps) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "transition-[padding] duration-300 ease-smooth",
          collapsed ? "lg:pl-sidebar-collapsed" : "lg:pl-sidebar",
        )}
      >
        <Topbar eyebrow={eyebrow} title={title} />
        <main
          className={cn(
            "mx-auto w-full px-4 py-6 transition-[max-width] duration-300 ease-smooth sm:px-6 lg:px-8",
            wide ? "max-w-[1800px]" : "max-w-6xl",
          )}
        >
          {/* Transição de entrada a cada troca de setor/subsetor. */}
          <RouteTransition>{children}</RouteTransition>
        </main>
      </div>
    </div>
  );
}
