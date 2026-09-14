"use client";

import { Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { FilterUserGroup } from "@/types/cronograma";

export interface UserFilterModalProps {
  open: boolean;
  onClose: () => void;
  groups: readonly FilterUserGroup[];
  /** Ids marcados. Vazio = "Geral" (todo mundo). */
  selected: readonly string[];
  onChange: (selected: readonly string[]) => void;
}

const chip =
  "focus-ring flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors";
const chipOn = "border-primary bg-primary/10 text-primary";
const chipOff =
  "border-border bg-surface-3 text-muted hover:border-border-strong hover:text-foreground";

/**
 * Modal do filtro por pessoa (Gestor/Admin).
 *
 * Marcar aplica na hora — não há "Salvar": o calendário atrás do modal já
 * reflete a escolha, e fechar é só voltar a olhar para ele. "Geral" é o
 * estado sem ninguém marcado, e por isso é um botão que limpa a lista, não
 * uma pessoa a mais nela.
 *
 * Um bloco por setor. Quem está em dois setores aparece nos dois, e a marca
 * acompanha o id: marcar num bloco marca no outro.
 */
export function UserFilterModal({
  open,
  onClose,
  groups,
  selected,
  onChange,
}: UserFilterModalProps) {
  const general = selected.length === 0;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filtrar por usuário"
      description="Escolha de quem são as atividades que o calendário e o backlog mostram."
      className="max-w-lg"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-5 px-6 py-5">
        <button
          type="button"
          role="checkbox"
          aria-checked={general}
          onClick={() => onChange([])}
          className={cn(chip, "w-full justify-center", general ? chipOn : chipOff)}
        >
          {general && <Check className="h-3 w-3" />}
          <Users className="h-3.5 w-3.5" />
          Geral — todas as atividades, de todos
        </button>

        {groups.length === 0 && (
          <p className="text-xs text-muted">Nenhum usuário nos setores desta ferramenta.</p>
        )}

        {groups.map((group) => (
          <div key={group.slug}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </p>
            {group.users.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Sem usuários neste setor.</p>
            ) : (
              <div
                role="group"
                aria-label={`Usuários de ${group.label}`}
                className="mt-2 flex flex-wrap gap-2"
              >
                {group.users.map((user) => {
                  const on = selected.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(user.id)}
                      className={cn(chip, on ? chipOn : chipOff)}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {user.firstName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
