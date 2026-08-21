"use client";

import { useState } from "react";
import { MediaActions } from "./media-actions";
import { MediaEditModal, type MediaEditValue } from "./media-edit-modal";

export interface EditableMediaActionsProps {
  title: string;
  tags?: readonly string[];
  suggestions?: readonly string[];
  variant?: "overlay" | "inline";
  className?: string;
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
  variant = "overlay",
  className,
  onSave,
  onDelete,
}: EditableMediaActionsProps) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <MediaActions
        name={title}
        variant={variant}
        className={className}
        onEdit={() => setEditing(true)}
        onDelete={onDelete}
      />

      <MediaEditModal
        open={editing}
        onClose={() => setEditing(false)}
        initial={{ title, tags }}
        suggestions={suggestions}
        onSave={(value) => onSave?.(value)}
      />
    </>
  );
}
