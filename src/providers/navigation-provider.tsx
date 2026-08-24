"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

/**
 * Navegação client-side da plataforma.
 *
 * Motivação: até aqui cada troca de setor/subsetor era um `<Link>` puro sobre
 * rotas `force-dynamic` com `loading.tsx` no segmento `/setores`. O fallback do
 * Suspense substituía a ÁRVORE INTEIRA da página — e como o `AppShell`
 * (Sidebar + Topbar) é renderizado dentro de cada página, a barra lateral
 * desmontava junto. O efeito visual era exatamente o de um reload, com a
 * viewport voltando ao topo e o menu de subsetores fechando.
 *
 * A correção tem três partes:
 *  1. Remover os `loading.tsx` de `/` e `/setores` (o conteúdo antigo
 *     permanece na tela enquanto o servidor responde).
 *  2. Navegar dentro de `startTransition` + `router.push(href, { scroll:false })`,
 *     o que dá um estado `pending` real e impede o salto seco de scroll.
 *  3. Rolar até o topo de forma suave APÓS a nova rota entrar, e só quando a
 *     página realmente estava rolada.
 */

interface NavigationContextValue {
  /** Navega para `href` sem recarregar a árvore e sem salto de scroll. */
  navigate: (href: string) => void;
  /** Há uma navegação em andamento. */
  pending: boolean;
  /** Destino da navegação em andamento (para destacar o item clicado). */
  pendingHref: string | null;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Marca que a próxima mudança de pathname veio de uma navegação nossa —
  // é ela que deve rolar ao topo, não um `popstate` do usuário.
  const shouldScrollRef = useRef(false);
  const lastPathRef = useRef(pathname);

  const navigate = useCallback(
    (href: string) => {
      // Mesmo destino: não navega, só devolve o usuário ao topo.
      if (href === pathname) {
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        return;
      }

      setPendingHref(href);
      shouldScrollRef.current = true;
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [pathname, router],
  );

  // Rota nova montada: limpa o pendente e sobe a viewport com suavidade.
  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    setPendingHref(null);

    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;

    if (window.scrollY > 0) {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  }, [pathname]);

  // Transição concluída sem troca de rota (ex.: destino inválido).
  useEffect(() => {
    if (!pending) setPendingHref(null);
  }, [pending]);

  const value = useMemo<NavigationContextValue>(
    () => ({ navigate, pending, pendingHref }),
    [navigate, pending, pendingHref],
  );

  return (
    <NavigationContext.Provider value={value}>
      <NavigationProgress active={pending} />
      {children}
    </NavigationContext.Provider>
  );
}

/**
 * Barra fina no topo enquanto o servidor responde. Substitui o esqueleto de
 * página inteira: o usuário continua vendo o conteúdo atual e a barra lateral.
 */
function NavigationProgress({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      return;
    }
    // Deixa a barra completar antes de sumir (evita piscada em rota rápida).
    const timer = setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(timer);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden"
    >
      <div
        className={
          "h-full w-full bg-gradient-to-r from-accent via-primary to-accent transition-transform duration-200 " +
          (active ? "animate-nav-progress" : "translate-x-0")
        }
      />
    </div>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation precisa estar dentro de <NavigationProvider>.");
  return ctx;
}
