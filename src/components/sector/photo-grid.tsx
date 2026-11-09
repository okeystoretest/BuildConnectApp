"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useToast } from "@/providers/toast-provider";
import { deleteSectorPhoto, updateSectorPhoto } from "@/lib/sector-actions";
import { EditableMediaActions } from "./editable-media-actions";
import type { PhotoItem } from "@/types/sector";

export function PhotoGrid({ photos, slug }: { photos: readonly PhotoItem[]; slug: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => (
        <PhotoCard key={photo.id} photo={photo} slug={slug} />
      ))}
    </div>
  );
}

/** "Verão · Cápsula 1 · 2026", pulando o que a foto não tem. */
function legenda(photo: PhotoItem): string {
  return [photo.temporada, photo.colecao, photo.ano].filter(Boolean).join(" · ");
}

/**
 * Uma foto: abre em tela cheia ao clicar e, para quem gerencia, edita e
 * exclui.
 *
 * O card ERA um `<button>` com `aria-label="Abrir foto: …"` e nenhum
 * `onClick`: anunciava uma ação ao leitor de tela, recebia o foco do teclado e
 * não fazia nada. O `ImageLightbox` já existia pronto e sem uso.
 *
 * Os controles de gestão são IRMÃOS do botão, nunca filhos — `<button>` dentro
 * de `<button>` é HTML inválido e o React reclama no console (a mesma
 * armadilha do card de vídeo).
 */
function PhotoCard({ photo, slug }: { photo: PhotoItem; slug: string }) {
  const router = useRouter();
  const toast = useToast();
  const [aberta, setAberta] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function remove() {
    startDelete(async () => {
      const res = await deleteSectorPhoto({ slug, id: photo.id });
      if (res.ok) {
        toast.success("Foto excluída.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Falha ao excluir a foto.");
      }
    });
  }

  async function save(value: { title: string; temporada?: string; colecao?: string }) {
    setSaving(true);
    setSaveError(null);
    const res = await updateSectorPhoto({
      slug,
      id: photo.id,
      title: value.title,
      temporada: value.temporada ?? "",
      colecao: value.colecao ?? "",
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setSaveError(res.error ?? "Falha ao salvar a foto.");
    }
  }

  const texto = legenda(photo);

  return (
    <article
      className={`group relative aspect-[4/3] overflow-hidden rounded-xl transition-opacity ${
        deleting ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={`Abrir foto: ${photo.title}`}
        className="focus-ring absolute inset-0 h-full w-full text-left transition-transform hover:scale-[1.01]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.filePath}
          alt={photo.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <span className="block text-sm font-medium text-white">{photo.title}</span>
          {/* Temporada · Coleção · Ano: sem isto, filtrar por temporada
              devolveria uma grade em que nada diz a temporada de nada. */}
          {texto && <span className="block text-[11px] text-white/75">{texto}</span>}
        </span>
      </button>

      {/* Foto só existe na vitrine, então `collection` é sempre verdadeiro —
          e com ele o modal já esconde as tags e mostra temporada e coleção. */}
      <EditableMediaActions
        title={photo.title}
        temporada={photo.temporada}
        colecao={photo.colecao}
        collection={{ ano: photo.ano }}
        editing={editing}
        onEditingChange={(open) => {
          setEditing(open);
          if (!open) setSaveError(null);
        }}
        saving={saving}
        saveError={saveError}
        onSave={(value) => void save(value)}
        onDelete={remove}
      />

      <ImageLightbox
        open={aberta}
        src={photo.filePath}
        alt={photo.title}
        downloadName={photo.title}
        onClose={() => setAberta(false)}
      />
    </article>
  );
}
