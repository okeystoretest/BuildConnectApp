"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSectorLink, updateSectorLink } from "@/lib/sector-actions";
import type { LinkItem } from "@/types/sector";

export interface LinkModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  /** Presente = edição (exclusivo de Admin). Ausente = criação. */
  link?: LinkItem | null;
}

const ICON_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Cadastro e edição de um aplicativo do setor.
 * O ícone enviado passa pelo sharp no servidor e vira .webp — aqui só
 * fazemos a pré-visualização local.
 */
export function LinkModal({ slug, open, onClose, link = null }: LinkModalProps) {
  const router = useRouter();
  const iconRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(link);

  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Recarrega o formulário ao abrir (novo ou sobre outro aplicativo).
  useEffect(() => {
    if (!open) return;
    setLabel(link?.label ?? "");
    setUrl(link?.url ?? "");
    setIcon(null);
    setPreview(link?.iconPath ?? null);
    setError(null);
    if (iconRef.current) iconRef.current.value = "";
  }, [open, link]);

  // Libera a URL de pré-visualização criada localmente.
  useEffect(() => {
    if (!icon) return;
    const objectUrl = URL.createObjectURL(icon);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [icon]);

  function handleClose() {
    if (pending) return;
    onClose();
  }

  function submit() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("label", label.trim());
      fd.set("url", url.trim());
      if (icon) fd.set("icon", icon);
      if (link) fd.set("id", link.id);

      const res = link ? await updateSectorLink(fd) : await addSectorLink(fd);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao salvar o aplicativo.");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-md">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">
          {editing ? "Editar aplicativo" : "Novo aplicativo"}
        </h2>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="link-label">Nome</Label>
            <Input
              id="link-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Painel de indicadores"
            />
          </div>

          <div>
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <Label htmlFor="link-icon">Ícone da plataforma</Label>
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface-2 text-muted">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <Button
                  variant="secondary"
                  onClick={() => iconRef.current?.click()}
                  className="w-full"
                >
                  {preview ? "Trocar ícone" : "Selecionar ícone (opcional)"}
                </Button>
                <p className="mt-1.5 text-[11px] text-muted">
                  JPG, PNG ou WebP. Convertido para .webp no servidor.
                </p>
              </div>
            </div>
            <input
              id="link-icon"
              ref={iconRef}
              type="file"
              accept={ICON_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                setError(null);
                setIcon(e.target.files?.[0] ?? null);
              }}
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={pending} className="h-11">
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending} className="h-11">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Salvando" : "Salvar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
