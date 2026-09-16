"use client";

import { useState } from "react";
import { MediaActions } from "./media-actions";
import { MediaEditModal, type MediaEditValue } from "./media-edit-modal";

export interface EditableMediaActionsProps {
  title: string;
  tags?: readonly string[];
  suggestions?: readonly string[];
  /** Presente só para vídeos: habilita o campo de transcrição na edição. */
  transcript?: { hasCurrent: boolean };
  variant?: "overlay" | "inline";
  className?: string;
  /** true enquanto `onSave` roda no servidor; o modal fica aberto e travado. */
  saving?: boolean;
  saveError?: string | null;
  /** Controlado por fora quando o pai precisa fechar o modal após salvar. */
  editing?: boolean;
  onEditingChange?: (open: boolean) => void;
  onSave?: (value: MediaEditValue) => void;
  onDelete?: () => void;
}

/**
 * Ações de Admin (editar/excluir) já acopladas ao modal de edição
 * de título e tags. Os cards de mídia usam este wrapper.
 */
export function EditableMediaActions({
  title,
  tags = [],
  suggestions = [],
  transcript,
  variant = "overlay",
  className,
  saving,
  saveError,
  editing,
  onEditingChange,
  onSave,
  onDelete,
}: EditableMediaActionsProps) {
  const [internalEditing, setInternalEditing] = useState(false);
  const open = editing ?? internalEditing;
  const setOpen = onEditingChange ?? setInternalEditing;

  return (
    <>
      <MediaActions
        name={title}
        variant={variant}
        className={className}
        onEdit={() => setOpen(true)}
        onDelete={onDelete}
      />

      <MediaEditModal
        open={open}
        onClose={() => setOpen(false)}
        initial={{ title, tags }}
        suggestions={suggestions}
        transcript={transcript}
        saving={saving}
        serverError={saveError}
        onSave={(value) => onSave?.(value)}
      />
    </>
  );
}
