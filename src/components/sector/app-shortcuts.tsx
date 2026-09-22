"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, Loader2, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useRole } from "@/providers/role-provider";
import { deleteSectorLink } from "@/lib/sector-actions";
import type { LinkItem } from "@/types/sector";

export interface AppShortcutsProps {
  slug: string;
  links: readonly LinkItem[];
  /** Quando presente, a lista vem herdada deste subsetor de origem. */
  sourceLabel?: string;
  onCreate?: () => void;
  onEdit?: (link: LinkItem) => void;
}

/** Logotipo da plataforma (.webp), redondo, ou o placeholder de aplicativo. */
function AppLogo({ link }: { link: LinkItem }) {
  if (link.iconPath) {
    return (
      <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-border bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={link.iconPath} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
      <AppWindow className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * Atalhos dos aplicativos do setor, logo abaixo da barra de abas.
 *
 * Eram uma aba. Aba é onde se vai procurar conteúdo; aplicativo é onde se vai
 * SAIR do sistema para trabalhar em outro — e enterrá-lo atrás de um clique,
 * ao lado de Documentos e Avaliações, custava uma navegação para uma ação que
 * é de passagem. Aqui eles ficam à vista em qualquer aba.
 *
 * A URL não aparece em lugar nenhum da pílula. Ela continua no `href`, porque
 * é isso que faz abrir em nova aba, clique do meio e "copiar endereço"
 * funcionarem — esconder o endereço do NAVEGADOR exigiria trocar o link por
 * JavaScript, e o preço seria alto demais para o ganho.
 *
 * Gestão vive aqui também: para quem pode, cada pílula revela editar e
 * excluir, e o "+" no fim abre o cadastro. Os botões de ação são IRMÃOS do
 * link, nunca filhos — `<button>` dentro de `<a>` é HTML inválido e o React
 * reclama no console (a mesma armadilha do card de vídeo).
 */
export function AppShortcuts({ slug, links, sourceLabel, onCreate, onEdit }: AppShortcutsProps) {
  const router = useRouter();
  const { can, role } = useRole();
  const canManage = can("links.manage");
  const isAdmin = role === "ADMIN";

  const [target, setTarget] = useState<LinkItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Sem aplicativos e sem poder cadastrar: nada na tela. Uma fileira vazia com
  // uma frase explicando que não há nada é espaço gasto para não dizer nada.
  if (links.length === 0 && !canManage) return null;

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
    <>
      {/* Uma linha só, rolando na horizontal: um setor com doze aplicativos
          não pode empurrar o conteúdo para fora da primeira dobra. */}
      <nav
        aria-label="Aplicativos do setor"
        className="scrollbar-slim mt-3 -mx-1 overflow-x-auto px-1 pb-1"
      >
        <div className="flex w-max items-center gap-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="group/app relative flex items-center rounded-full border border-border bg-surface transition-colors hover:border-border-strong"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "focus-ring flex items-center gap-2 rounded-full py-1.5 pl-1.5 text-xs font-medium text-foreground",
                  // Espaço à direita para os controles do Admin não cobrirem o
                  // nome do aplicativo ao aparecerem.
                  isAdmin ? "pr-2 group-hover/app:pr-1" : "pr-4",
                )}
              >
                <AppLogo link={link} />
                <span className="whitespace-nowrap">
                  <span className="text-muted">Ir para</span> {link.label}
                </span>
              </a>

              {isAdmin && (
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-0.5 pr-1.5 transition-opacity",
                    // Escondidos até o foco ou o hover, e nunca com `hidden`:
                    // o teclado precisa alcançá-los, e `opacity` mantém o nó
                    // focável enquanto `display:none` o tiraria da ordem de
                    // tabulação.
                    "opacity-0 focus-within:opacity-100 group-hover/app:opacity-100",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onEdit?.(link)}
                    aria-label={`Editar ${link.label}`}
                    className="focus-ring flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setTarget(link);
                    }}
                    aria-label={`Excluir ${link.label}`}
                    className="focus-ring flex h-6 w-6 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/15"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          ))}

          {canManage && (
            <button
              type="button"
              onClick={onCreate}
              aria-label="Novo aplicativo"
              title="Novo aplicativo"
              className="focus-ring flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {/* O rótulo só aparece na fileira vazia: com aplicativos
                  cadastrados, o "+" sozinho já se entende e não disputa
                  espaço com eles. */}
              {links.length === 0 && "Novo aplicativo"}
            </button>
          )}

          {/*
           * O aviso de herança não pode sumir com a aba: sem ele, um Admin
           * edita o atalho do Marketing sem saber que mexeu no de Vendas.
           * Só para quem gerencia — para os demais é ruído.
           */}
          {sourceLabel && canManage && (
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap px-2 text-[11px] text-muted"
              title={`Alterações nestes aplicativos valem também para ${sourceLabel}.`}
            >
              <Share2 className="h-3.5 w-3.5" />
              Compartilhados com {sourceLabel}
            </span>
          )}
        </div>
      </nav>

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
    </>
  );
}
