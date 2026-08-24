"use client";

import Link from "next/link";
import { useNavigation } from "@/providers/navigation-provider";

export interface NavLinkProps
  extends Omit<React.ComponentPropsWithoutRef<"a">, "href" | "onClick"> {
  href: string;
  /** Executado antes de navegar (fechar drawer/popover, por exemplo). */
  onNavigate?: () => void;
  children: React.ReactNode;
}

/**
 * `<Link>` que navega pelo `NavigationProvider`.
 *
 * Mantém o `<Link>` do Next por baixo (prefetch, href real, abrir em nova aba),
 * mas intercepta o clique simples para usar `router.push(..., {scroll:false})`
 * dentro de uma transição — sem desmontar a casca da aplicação e sem o salto
 * de scroll. Cliques com modificador (Ctrl/Cmd/Shift/Alt) e botão do meio
 * seguem o comportamento nativo do navegador.
 */
export function NavLink({ href, onNavigate, children, ...rest }: NavLinkProps) {
  const { navigate } = useNavigation();

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onNavigate?.();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
