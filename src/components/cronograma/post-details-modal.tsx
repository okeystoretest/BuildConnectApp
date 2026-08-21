"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock,
  Loader2,
  Lock,
  Pencil,
  Tag,
  Trash2,
  User as UserIcon,
  Users,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, initials } from "@/lib/utils";
import {
  BRAND,
  FORMAT_LABEL,
  FUNNEL,
  STATUS_LABEL,
  STATUS_TONE,
  resolveBrand,
} from "@/lib/funnel";
import { VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/cronograma-visibility";
import { deleteContentPost } from "@/lib/cronograma-actions";
import type { ContentPostItem } from "@/types/cronograma";

export interface PostDetailsModalProps {
  slug: string;
  open: boolean;
  post: ContentPostItem | null;
  onClose: () => void;
  /** Abre o formulário de edição para este post. */
  onEdit: (post: ContentPostItem) => void;
}

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <div className="mt-1.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

/**
 * Detalhes do post.
 *
 * É o que abre ao clicar num card — o formulário deixou de ser a porta de
 * entrada. Aqui se LÊ tudo; editar e excluir são ações explícitas e só
 * aparecem para quem a Server Action de fato autoriza (`canEdit`/`canDelete`,
 * resolvidos no servidor: dono do card ou Admin).
 */
export function PostDetailsModal({ slug, open, post, onClose, onEdit }: PostDetailsModalProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setConfirming(false);
    setError(null);
  }, [open, post?.id]);

  if (!post) return null;

  const brandKey = resolveBrand(post.brand);
  const brand = brandKey ? BRAND[brandKey] : null;

  function handleClose() {
    if (pending) return;
    onClose();
  }

  function remove() {
    if (!post) return;
    setError(null);
    start(async () => {
      const res = await deleteContentPost({ id: post.id, slug });
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao excluir o post.");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-lg">
      <div className="p-6">
        {/* Cabeçalho: título, funil, formato, status e marca */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Detalhes da atividade
            </p>
            <h2 className="mt-1 break-words text-lg font-semibold text-foreground">
              {post.title}
            </h2>
          </div>
          <Badge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              FUNNEL[post.funnel].badge,
            )}
          >
            {FUNNEL[post.funnel].label}
          </span>
          <span className="rounded border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {FORMAT_LABEL[post.format]}
          </span>
          {brand && (
            <span
              className="rounded border px-2 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: brand.background,
                borderColor: brand.border,
                color: brand.foreground,
              }}
            >
              {brand.label}
            </span>
          )}
        </div>

        {/* Alcance: quem enxerga esta atividade */}
        <div
          className={cn(
            "mt-4 rounded-lg border p-3",
            post.visibility === "SHARED"
              ? "border-info/30 bg-info/10"
              : "border-border bg-surface-2",
          )}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            {post.visibility === "SHARED" ? (
              <Users className="h-3.5 w-3.5" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            {VISIBILITY_LABEL[post.visibility]}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            {VISIBILITY_HINT[post.visibility]}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field icon={<CalendarDays className="h-3 w-3" />} label="Data">
            {formatDate(post.date)}
          </Field>
          <Field icon={<Clock className="h-3 w-3" />} label="Horário">
            {post.time}
          </Field>
          <Field icon={<UserIcon className="h-3 w-3" />} label="Responsável">
            {post.owner ? (
              <span className="flex items-center gap-2">
                {post.owner.avatarPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.owner.avatarPath}
                    alt=""
                    className="h-6 w-6 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                    {initials(post.owner.name)}
                  </span>
                )}
                <span className="truncate">{post.owner.name}</span>
              </span>
            ) : (
              <span className="text-muted">Sem responsável</span>
            )}
          </Field>
          <Field icon={<Tag className="h-3 w-3" />} label="Criado por">
            {post.authorName ?? <span className="text-muted">—</span>}
          </Field>
        </div>

        {/* Observações completas — o card mostra só o resumo. */}
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Observações
          </p>
          {post.notes ? (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {post.notes}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-muted">Nenhuma observação registrada.</p>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          {post.canDelete ? (
            <Button
              variant="secondary"
              onClick={() => setConfirming(true)}
              disabled={pending}
              className="h-11 text-danger"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleClose} disabled={pending} className="h-11">
              Fechar
            </Button>
            {post.canEdit && (
              <Button onClick={() => onEdit(post)} disabled={pending} className="h-11">
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </div>

        {confirming && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-4">
            <p className="text-sm text-foreground">
              Excluir <span className="font-semibold">{post.title}</span> do cronograma?
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                Manter
              </Button>
              <Button variant="danger" onClick={remove} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
