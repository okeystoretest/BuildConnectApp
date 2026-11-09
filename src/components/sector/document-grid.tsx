"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteSectorDocument,
  updateSectorDocument,
} from "@/lib/sector-actions";
import { useToast } from "@/providers/toast-provider";
import { EditableMediaActions } from "./editable-media-actions";
import type { DocumentItem, FileKind } from "@/types/sector";

const KIND_STYLE: Record<FileKind, string> = {
  PDF: "bg-danger/15 text-danger",
  DOCX: "bg-info/15 text-info",
  XLSX: "bg-primary/15 text-primary",
  PPTX: "bg-warning/15 text-warning",
  PNG: "bg-accent/15 text-accent",
};

export function DocumentGrid({
  documents,
  slug,
  collection = false,
}: {
  documents: readonly DocumentItem[];
  slug: string;
  /** Vitrine: a edição oferece Temporada e Coleção, e esconde as tags. */
  collection?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          doc={doc}
          slug={slug}
          collection={collection}
        />
      ))}
    </div>
  );
}

/**
 * Um card por documento, com o estado da própria edição.
 *
 * O estado desceu para cá quando a edição passou a gravar: `saving` e o erro
 * do servidor são de UM documento, e mantê-los na grade faria o modal de um
 * item piscar o erro de outro.
 */
function DocumentCard({
  doc,
  slug,
  collection,
}: {
  doc: DocumentItem;
  slug: string;
  collection: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startDelete] = useTransition();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function remove() {
    startDelete(async () => {
      const res = await deleteSectorDocument({ slug, id: doc.id });
      if (res.ok) {
        toast.success("Documento excluído.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Falha ao excluir o documento.");
      }
    });
  }

  async function save(value: {
    title: string;
    temporada?: string;
    colecao?: string;
  }) {
    setSaving(true);
    setSaveError(null);
    const res = await updateSectorDocument({
      slug,
      id: doc.id,
      name: value.title,
      // Ausentes fora da vitrine: é a ausência que preserva o que está gravado.
      ...(collection
        ? { temporada: value.temporada ?? "", colecao: value.colecao ?? "" }
        : {}),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setSaveError(res.error ?? "Falha ao salvar o documento.");
    }
  }

  return (
    <>
      <article className="relative rounded-xl border border-border bg-surface p-4">
        <EditableMediaActions
          title={doc.name}
          temporada={doc.temporada}
          colecao={doc.colecao}
          collection={collection ? { ano: doc.ano } : undefined}
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

        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold",
              KIND_STYLE[doc.kind],
            )}
          >
            {doc.kind}
          </span>
          <div className="min-w-0 pr-14">
            <h3 className="truncate text-sm font-medium text-foreground">
              {doc.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted">{doc.size}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {/* Só o PDF abre no navegador. Office (DOCX/XLSX/PPTX) não
                renderiza sem serviço externo, e mandar o arquivo para um
                visualizador de terceiros exporia o acervo — então só baixa. */}
          {doc.kind === "PDF" && (
            <a
              href={doc.filePath}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-surface-2 text-xs text-foreground transition-colors hover:bg-surface-3"
            >
              <Eye className="h-3.5 w-3.5" />
              Visualizar
            </a>
          )}
          <a
            href={doc.filePath}
            download={doc.name}
            aria-label={`Baixar ${doc.name}`}
            className={cn(
              "focus-ring flex h-9 items-center justify-center gap-2 rounded-lg bg-primary/15 text-xs text-primary transition-colors hover:bg-primary/25",
              doc.kind === "PDF" ? "w-9" : "flex-1",
            )}
          >
            <Download className="h-3.5 w-3.5" />
            {doc.kind !== "PDF" && "Baixar"}
          </a>
        </div>
      </article>
    </>
  );
}
