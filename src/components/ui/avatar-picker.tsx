"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png"];
const MAX_SIZE_MB = 2;

export interface AvatarPickerProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** Iniciais exibidas enquanto não há foto. */
  fallback?: string;
}

/**
 * Foto de perfil do colaborador. O tratamento (resize + conversão para
 * .webp via sharp) acontece no backend; aqui só validamos e mostramos.
 */
export function AvatarPicker({ file, onChange, fallback = "?" }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleSelect(selected: File | undefined) {
    if (!selected) return;
    if (!ACCEPTED.includes(selected.type)) {
      setError("Use JPG ou PNG.");
      return;
    }
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Arquivo acima de ${MAX_SIZE_MB} MB.`);
      return;
    }
    setError(null);
    onChange(selected);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-full",
            preview ? "border border-border" : "bg-primary text-2xl font-semibold text-primary-foreground",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Prévia da foto de perfil" className="h-full w-full object-cover" />
          ) : (
            fallback
          )}
        </span>

        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="focus-ring flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
          >
            <Camera className="h-4 w-4" />
            Foto de perfil
          </button>
          <p className="mt-1.5 text-[11px] text-muted">JPG ou PNG · até {MAX_SIZE_MB} MB</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        onChange={(e) => handleSelect(e.target.files?.[0])}
      />

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
