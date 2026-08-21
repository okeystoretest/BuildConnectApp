"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, ExternalLink, Loader2, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { PermissionGate } from "@/components/layout/permission-gate";
import { useRole } from "@/providers/role-provider";
import { deleteSectorLink } from "@/lib/sector-actions";
import type { LinkItem } from "@/types/sector";

export interface LinksPanelProps {
  slug: string;
  links: readonly LinkItem[];
  /** Quando presente, a lista vem herdada deste subsetor de origem. */
  sourceLabel?: string;
  onCreate?: () => void;
  onEdit?: (link: LinkItem) => void;
}

/** Ícone da plataforma (.webp) ou placeholder padrão. */
function AppIcon({ link }: { link: LinkItem }) {
  if (link.iconPath) {
    return (
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={link.iconPath} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
      <AppWindow className="h-4 w-4" />
    </span>
  );
}

/**
 * Aplicativos do setor. Criar exige `links.manage`; editar e excluir são
 * exclusivos de ADMIN — os demais papéis nem veem os controles.
 */
export function LinksPanel({ slug, links, sourceLabel, onCreate, onEdit }: LinksPanelProps) {
  const router = useRouter();
  const { can, role } = useRole();
  const canManage = can("links.manage");
  const isAdmin = role === "ADMIN";

  const [target, setTarget] = useState<LinkItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirmDelete() {
    if (!target) return;
    setError(null);
    start(async () => {
      const res = await deleteSectorLink({ id: target.id, slug });
      if (res.ok) {
        setTarget(null);
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao excluir o aplicativo.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Aplicativos e sistemas externos do setor.</p>
          {sourceLabel && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
              <Share2 className="h-3.5 w-3.5" />
              Lista compartilhada com {sourceLabel} — alterações valem para os dois setores.
            </p>
          )}
        </div>
        <PermissionGate permission="links.manage">
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Novo aplicativo
          </Button>
        </PermissionGate>
      </div>

      {links.length > 0 ? (
        <div className="space-y-3">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="focus-ring flex min-w-0 flex-1 items-center gap-4 rounded-lg"
              >
                <AppIcon link={link} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {link.label}
                  </span>
                  <span className="block truncate text-xs text-muted">{link.url}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted" />
              </a>

              {isAdmin && (
                <div className="flex shrink-0 items-center gap-1 border-l border-border pl-3">
                  <button
                    type="button"
                    onClick={() => onEdit?.(link)}
                    aria-label={`Editar ${link.label}`}
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setTarget(link);
                    }}
                    aria-label={`Excluir ${link.label}`}
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger/15"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<AppWindow className="h-5 w-5" />}
          title="Nenhum aplicativo cadastrado"
          description={
            canManage
              ? "Cadastre o primeiro aplicativo para a equipe encontrar os sistemas do setor."
              : "Quando a liderança cadastrar aplicativos do setor, eles aparecem aqui."
          }
          action={
            canManage ? (
              <Button onClick={onCreate}>
                <Plus className="h-4 w-4" />
                Novo aplicativo
              </Button>
            ) : undefined
          }
        />
      )}

      <Modal
        open={target !== null}
        onClose={() => {
          if (!pending) setTarget(null);
        }}
        title="Excluir aplicativo"
        description="O atalho e o ícone são removidos permanentemente."
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-muted">
            Confirma a exclusão de{" "}
            <span className="font-semibold text-foreground">{target?.label}</span>? Esta ação não
            pode ser desfeita.
          </p>
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
