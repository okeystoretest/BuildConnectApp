"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MediaEditValue {
  title: string;
  tags: readonly string[];
}

export interface MediaEditModalProps {
  open: boolean;
  onClose: () => void;
  initial: MediaEditValue;
  /** Sugestões existentes no setor, para reaproveitar filtros. */
  suggestions?: readonly string[];
  onSave: (value: MediaEditValue) => void;
}

/**
 * Edição de vídeo/documento: título e tags.
 * As tags alimentam as pílulas de filtro — vincular aqui é o que
 * faz a filtragem dinâmica funcionar.
 */
export function MediaEditModal({
  open,
  onClose,
  initial,
  suggestions = [],
  onSave,
}: MediaEditModalProps) {
  const [title, setTitle] = useState(initial.title);
  const [tags, setTags] = useState<readonly string[]>(initial.tags);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Recarrega ao abrir sobre outro item.
  useEffect(() => {
    if (open) {
      setTitle(initial.title);
      setTags(initial.tags);
      setDraft("");
      setError(null);
    }
  }, [open, initial.title, initial.tags]);

  function addTag(value: string) {
    const clean = value.trim();
    if (!clean) return;
    if (!tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setTags([...tags, clean]);
    }
    setDraft("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleSave() {
    if (!title.trim()) {
      setError("O título não pode ficar vazio.");
      return;
    }
    onSave({ title: title.trim(), tags });
    onClose();
  }

  const available = suggestions.filter((s) => !tags.includes(s));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar conteúdo"
      description="Altere o título e as tags de filtragem."
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar alterações</Button>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div>
          <Label htmlFor="media-title">Título</Label>
          <Input
            id="media-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            className="h-11 rounded-xl"
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>

        <div>
          <Label htmlFor="media-tag">Tags / filtros</Label>
          <div className="flex gap-2">
            <Input
              id="media-tag"
              value={draft}
              placeholder="Ex.: Segurança"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(draft);
                }
              }}
              className="h-10 rounded-lg"
            />
            <Button variant="secondary" onClick={() => addTag(draft)} className="shrink-0">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>

          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remover tag ${tag}`}
                    className="focus-ring rounded-full text-primary/70 transition-colors hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {available.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] text-muted">Sugestões do setor:</p>
              <div className="flex flex-wrap gap-2">
                {available.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => addTag(suggestion)}
                    className="focus-ring rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
