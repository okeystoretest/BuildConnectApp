"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  BRAND,
  FORMAT_LABEL,
  FUNNEL,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  resolveBrand,
} from "@/lib/funnel";
import { setContentPostStatus } from "@/lib/cronograma-actions";
import type { ContentPostItem, ContentStatus } from "@/types/cronograma";

export interface ProductionBacklogProps {
  slug: string;
  items: readonly ContentPostItem[];
  /** Clique na linha: abre o modal de DETALHES (não o formulário). */
  onSelect: (post: ContentPostItem) => void;
}

const PREVIEW = 6;

function Avatar({ name, avatarPath }: { name: string; avatarPath?: string }) {
  if (avatarPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarPath}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
      {initials(name)}
    </span>
  );
}

/**
 * Fila de produção: o que ainda não foi publicado no mês, com troca de status
 * inline. É a visão de execução — o calendário mostra quando, esta tabela
 * mostra em que pé está.
 *
 * O seletor de status só fica ativo nas linhas do próprio autor; nas demais
 * o status aparece como selo. A permissão vem pronta do servidor (`canEdit`).
 */
export function ProductionBacklog({ slug, items, onSelect }: ProductionBacklogProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = expanded ? items : items.slice(0, PREVIEW);

  function changeStatus(post: ContentPostItem, status: ContentStatus) {
    setBusyId(post.id);
    start(async () => {
      const res = await setContentPostStatus({ id: post.id, slug, status });
      setBusyId(null);
      if (res.ok) router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Backlog vazio"
        description="Nenhum post pendente neste mês. Tudo publicado ou nada planejado ainda."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-semibold">Título</th>
              <th className="py-2 pr-3 font-semibold">Data</th>
              <th className="py-2 pr-3 font-semibold">Formato</th>
              <th className="py-2 pr-3 font-semibold">Funil</th>
              <th className="py-2 pr-3 font-semibold">Marca</th>
              <th className="py-2 pr-3 font-semibold">Responsável</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((post) => (
              <tr
                key={post.id}
                onClick={() => onSelect(post)}
                className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface-2"
              >
                <td className="py-3 pr-3">
                  <span className="block font-medium text-foreground">{post.title}</span>
                  {/* Resumo da observação — o texto completo abre no modal. */}
                  {post.notes && (
                    <span
                      className="mt-0.5 block max-w-[280px] truncate text-[11px] text-muted"
                      title={post.notes}
                    >
                      {post.notes.replace(/\s+/g, " ").trim()}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-3 text-muted">
                  {post.date.slice(8, 10)}/{post.date.slice(5, 7)} · {post.time}
                </td>
                <td className="py-3 pr-3 text-muted">{FORMAT_LABEL[post.format]}</td>
                <td className="py-3 pr-3">
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      FUNNEL[post.funnel].badge,
                    )}
                  >
                    {FUNNEL[post.funnel].short}
                  </span>
                </td>
                <td className="py-3 pr-3">
                  {(() => {
                    const key = resolveBrand(post.brand);
                    if (!key) return <span className="text-muted">—</span>;
                    return (
                      <span
                        className="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: BRAND[key].background,
                          borderColor: BRAND[key].border,
                          color: BRAND[key].foreground,
                        }}
                      >
                        {BRAND[key].label}
                      </span>
                    );
                  })()}
                </td>
                <td className="py-3 pr-3">
                  {post.owner ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={post.owner.name} avatarPath={post.owner.avatarPath} />
                      <span className="text-foreground">{post.owner.name}</span>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                  {post.canEdit ? (
                    <span className="inline-flex items-center gap-2">
                      <select
                        value={post.status}
                        disabled={pending && busyId === post.id}
                        onChange={(e) => changeStatus(post, e.target.value as ContentStatus)}
                        className="focus-ring h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground"
                      >
                        {STATUS_ORDER.map((option) => (
                          <option key={option} value={option}>
                            {STATUS_LABEL[option]}
                          </option>
                        ))}
                      </select>
                      {pending && busyId === post.id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
                      )}
                    </span>
                  ) : (
                    <Badge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-primary"
        >
          {expanded ? "Mostrar menos" : `Ver tudo (${items.length})`}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
