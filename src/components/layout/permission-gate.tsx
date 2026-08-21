"use client";

import type { Permission } from "@/types";
import { useRole } from "@/providers/role-provider";

export interface PermissionGateProps {
  permission: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/** Envolve qualquer elemento restrito por papel. Evita condicional solta nas telas. */
export function PermissionGate({ permission, fallback = null, children }: PermissionGateProps) {
  const { can } = useRole();
  return <>{can(permission) ? children : fallback}</>;
}
