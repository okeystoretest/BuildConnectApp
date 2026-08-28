"use client";

import { useEffect, useState } from "react";
import { X, Search, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/utils";

export interface AssignTicketModalProps {
  open: boolean;
  /** Pessoas atribuíveis. Vazio para quem só pode assumir para si. */
  people: { id: string; name: string }[];
  /** Usuário logado — habilita o atalho "Atribuir para mim". */
  self?: { id: string; name: string } | null;
  /** Texto de apoio: explica por que a atribuição está sendo pedida. */
  description?: string;
  onClose: () => void;
  onSelect: (userId: string, userName: string) => void;
}

/**
 * Escolha do responsável por um chamado.
 *
 * Serve aos dois quadros: à ação "Atribuir para…" do quadro de Motoristas e à
 * exigência do quadro de Retaguarda quando um card é arrastado de Pendente
 * para Atribuído — mover para essa coluna sem responsável deixaria o chamado
 * num estado que o próprio nome contradiz, então a atribuição é pedida aqui e
 * gravada junto com o novo status.
 *
 * A lista chega pronta de quem abre o modal (`listAssignableUsers`).
 */
export function AssignTicketModal({
  open,
  people,
  self = null,
  description,
  onClose,
  onSelect,
}: AssignTicketModalProps) {
  const [query, setQuery] = useState("");

  // Cada abertura começa com a lista inteira à vista.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = query.trim()
    ? people.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : people;

  return (
    <Modal open={open} onClose={onClose} className="max-w-md">
      <div className="p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Atribuir chamado</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {self && (
          <Button className="mb-3 w-full" onClick={() => onSelect(self.id, self.name)}>
            <UserPlus className="h-4 w-4" />
            Atribuir para mim
          </Button>
        )}

        {people.length > 0 && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pessoa…"
              className="pl-9"
            />
          </div>
        )}

        <div className="scrollbar-slim max-h-72 space-y-1.5 overflow-y-auto">
          {filtered.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => onSelect(person.id, person.name)}
              className="focus-ring flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
                {initials(person.name)}
              </span>
              <span className="truncate text-sm text-foreground">{person.name}</span>
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-muted">
              {people.length === 0
                ? self
                  ? "Você só pode assumir este chamado para si."
                  : "Carregando…"
                : "Ninguém encontrado."}
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
