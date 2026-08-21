"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_SIZE_MB = 10;

export interface ImageUploaderProps {
  files: readonly File[];
  onChange: (files: readonly File[]) => void;
  max?: number;
  label?: string;
}

/**
 * Seleção de imagens do chamado. O tratamento (resize + conversão para .webp
 * via sharp) acontece no backend; aqui só validamos e mostramos o preview.
 */
export function ImageUploader({ files, onChange, max = 5, label = "Imagens" }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<readonly string[]>([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  function handleSelect(selected: FileList | null) {
    if (!selected) return;
    const incoming = Array.from(selected);
    const room = max - files.length;

    if (room <= 0) {
      setError(`Máximo de ${max} imagens.`);
      return;
    }

    const valid: File[] = [];
    for (const file of incoming.slice(0, room)) {
      if (!ACCEPTED.includes(file.type)) {
        setError("Formato inválido. Use JPG, PNG, WebP ou HEIC.");
        continue;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`“${file.name}” passa de ${MAX_SIZE_MB} MB.`);
        continue;
      }
      valid.push(file);
    }

    if (valid.length > 0) {
      setError(incoming.length > room ? `Só cabiam mais ${room}.` : null);
      onChange([...files, ...valid]);
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    setError(null);
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-foreground">
        {label} ({files.length}/{max})
      </p>

      <div className="flex flex-wrap gap-2.5">
        {previews.map((src, index) => (
          <div
            key={src}
            className="group relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-xl border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={files[index]?.name ?? `Imagem ${index + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remover imagem ${index + 1}`}
              className="focus-ring absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-background/85 text-muted transition-colors hover:text-danger"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {files.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Adicionar imagem"
            className={cn(
              "focus-ring flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-xl border border-border bg-surface-2 text-muted transition-colors",
              "hover:border-border-strong hover:text-foreground",
            )}
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="sr-only"
        onChange={(e) => handleSelect(e.target.files)}
      />

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
