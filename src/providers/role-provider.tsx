"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { CurrentUser, Permission, Role } from "@/types";
import { can as canFn } from "@/lib/permissions";

interface RoleContextValue {
  user: CurrentUser;
  role: Role;
  /**
   * Troca o papel ATIVO apenas na sessão do navegador — recurso de
   * pré-visualização para ADMIN. Não altera a sessão no servidor nem o
   * papel real do usuário.
   */
  setRole: (role: Role) => void;
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
  const [role, setRole] = useState<Role>(initialUser.role);

  const can = useCallback((permission: Permission) => canFn(role, permission), [role]);

  const value = useMemo<RoleContextValue>(
    () => ({ user: { ...initialUser, role }, role, setRole, can }),
    [initialUser, role, can],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole precisa estar dentro de <RoleProvider>.");
  return ctx;
}
