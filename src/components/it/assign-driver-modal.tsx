"use client";

import { useState } from "react";
import { X, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/utils";

export interface AssignDriverModalProps {
  open: boolean;
  drivers: { id: string; name: string }[];
  onClose: () => void;
  onSelect: (driverId: string, driverName: string) => void;
}

/**
 * Seleção do responsável (ação "Atribuir para…", exclusiva da gestão).
 * Lista de usuários ativos com filtro por nome. A lista chega já carregada
 * do board (listAssignableDrivers).
 */
export function AssignDriverModal({ open, drivers, onClose, onSelect }: AssignDriverModalProps) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? drivers.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()))
    : drivers;

  return (
    <Modal open={open} onClose={onClose} className="max-w-md">
      <div className="p-6">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Atribuir chamado</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pessoa…"
            className="pl-9"
          />
        </div>

        <div className="scrollbar-slim max-h-72 space-y-1.5 overflow-y-auto">
          {filtered.map((driver) => (
            <button
              key={driver.id}
              type="button"
              onClick={() => onSelect(driver.id, driver.name)}
              className="focus-ring flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
                {initials(driver.name)}
              </span>
              <span className="truncate text-sm text-foreground">{driver.name}</span>
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-muted">
              {drivers.length === 0 ? "Carregando…" : "Ninguém encontrado."}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
