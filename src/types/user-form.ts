import type { Role } from "@/types";

export interface UserFormState {
  photo: File | null;
  fullName: string;
  username: string;
  password: string;
  role: Role;
  sector: string;
  unit: string;
  subsectors: readonly string[];
}

export type UserFormErrors = Partial<Record<keyof UserFormState, string>>;

/** Converte o nome em sugestão de usuário: "Maria Silva" -> "maria#BC". */
export function suggestUsername(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  const normalized = first
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return normalized ? `${normalized}#BC` : "";
}

export const USERNAME_PATTERN = /^[a-z0-9._-]+#BC$/;
export const MIN_PASSWORD_LENGTH = 8;
