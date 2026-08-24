"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface SidebarContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Rótulos dos setores com o menu de subsetores aberto. */
  openGroups: readonly string[];
  toggleGroup: (label: string) => void;
  /** Abre o grupo sem fechar os demais (usado ao entrar por URL direta). */
  openGroup: (label: string) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "bc:sidebar";

interface PersistedState {
  collapsed: boolean;
  openGroups: string[];
}

function readPersisted(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      collapsed: Boolean(parsed.collapsed),
      openGroups: Array.isArray(parsed.openGroups) ? parsed.openGroups.filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Estado da barra lateral.
 *
 * Vive no layout raiz — acima das páginas — de propósito: o `Sidebar` é
 * renderizado dentro do `AppShell` de cada página e, portanto, é remontado a
 * cada navegação. Se `openGroups` morasse no componente, o menu de subsetores
 * fecharia sozinho toda vez que o usuário trocasse de setor. Mantido aqui (e
 * espelhado no localStorage), ele sobrevive à navegação e ao F5.
 */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<readonly string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hidratação: o servidor não conhece o localStorage. Ler no efeito evita
  // divergência de markup entre servidor e cliente.
  useEffect(() => {
    const persisted = readPersisted();
    if (persisted) {
      setCollapsed(persisted.collapsed);
      setOpenGroups(persisted.openGroups);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ collapsed, openGroups: [...openGroups] } satisfies PersistedState),
      );
    } catch {
      // Modo privado / storage cheio: a preferência simplesmente não persiste.
    }
  }, [collapsed, openGroups, hydrated]);

  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label],
    );
  }, []);

  const openGroup = useCallback((label: string) => {
    setOpenGroups((prev) => (prev.includes(label) ? prev : [...prev, label]));
  }, []);

  const value = useMemo(
    () => ({
      collapsed,
      toggleCollapsed,
      mobileOpen,
      setMobileOpen,
      openGroups,
      toggleGroup,
      openGroup,
    }),
    [collapsed, toggleCollapsed, mobileOpen, openGroups, toggleGroup, openGroup],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar precisa estar dentro de <SidebarProvider>.");
  return ctx;
}
