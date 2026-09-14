import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Primeiro nome, para selos e listas em que o nome inteiro não cabe. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Dois primeiros nomes — cabe no card sem perder quem é a pessoa. */
export function shortName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** Tamanho legível a partir de bytes (ex.: 2.4 MB, 88 KB). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
