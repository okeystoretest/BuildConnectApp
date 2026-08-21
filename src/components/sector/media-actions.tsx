"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useRole } from "@/providers/role-provider";

export interface MediaActionsProps {
  /** Nome exibido na confirmação de exclusão. */
  name: string;
  onEdit?: () => void;
  onDelete?: () => void;
  /** `overlay` posiciona sobre a capa; `inline` acompanha o conteúdo. */
  variant?: "overlay" | "inline";
  className?: string;
}

/**
 * Editar e excluir mídia. Exclusivo de Admin — os demais níveis
 * não veem os controles.
 */
export function MediaActions({
  name,
  onEdit,
  onDelete,
  variant = "overlay",
  className,
}: MediaActionsProps) {
  const { role } = useRole();
  const [confirming, setConfirming] = useState(false);

  if (role !== "ADMIN") return null;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1",
          variant === "overlay" &&
            "absolute right-2 top-2 z-10 rounded-lg bg-background/80 p-0.5 backdrop-blur",
          className,
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          aria-label={`Editar ${name}`}
          className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          aria-label={`Excluir ${name}`}
          className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger/15"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Excluir conteúdo"
        description="O arquivo é removido permanentemente do servidor."
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                onDelete?.();
              }}
            >
              Excluir
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-muted">
            Confirma a exclusão de <span className="font-semibold text-foreground">{name}</span>?
            Esta ação não pode ser desfeita.
          </p>
        </div>
      </Modal>
    </>
  );
}
