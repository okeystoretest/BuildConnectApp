"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { CurrentUser, Permission, Role } from "@/types";
import { can as canFn } from "@/lib/permissions";

interface RoleContextValue {
  user: CurrentUser;
  /**
   * Papel REAL da sessão, validado no servidor. Não há como trocá-lo pelo
   * cliente: o papel governa o que a tela oferece, e um seletor no navegador
   * fazia a interface discordar do que o servidor autoriza.
   */
  role: Role;
  can: (permission: Permission) => boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({
  initialUser,
  children,
}: {
  initialUser: CurrentUser;
  children: React.ReactNode;
}) {
  const role = initialUser.role;

  const can = useCallback((permission: Permission) => canFn(role, permission), [role]);

  const value = useMemo<RoleContextValue>(
    () => ({ user: initialUser, role, can }),
    [initialUser, role, can],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole precisa estar dentro de <RoleProvider>.");
  return ctx;
}
