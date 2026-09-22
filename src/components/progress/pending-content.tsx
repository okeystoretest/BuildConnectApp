"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { paginate } from "@/lib/paginate";
import { rejectionLevel } from "@/lib/video-comprehension";
import { PENDING_PAGE_SIZE, REDO_GROUP, flattenPending } from "@/lib/pending-content";
import { PendingItemPlayer } from "./pending-item-player";
import type { PendingCategory, PendingItem } from "@/lib/pending-content";

const REDO_MESSAGE = "Que tal rever com calma? Assista ao vídeo de novo e responda.";

function ItemRow({ item, onPlay }: { item: PendingItem; onPlay: () => void }) {
  const isVideo = item.kind === "VIDEO";
  const level = rejectionLevel(item.rejections);

  /*
   * Uma reprovação pinta de âmbar; duas ou mais, de vermelho — e da terceira
   * em diante o estado não muda mais (ver `rejectionLevel`).
   *
   * Cor NUNCA sozinha (WCAG 1.4.1): junto vão o ícone de alerta, o selo
   * "Refazer" e, no vermelho, a frase abaixo do arquivo. Quem não distingue
   * as cores continua recebendo o recado.
   */
  const tone =
    level === 2
      ? "border-danger/60 bg-danger/10 hover:border-danger"
      : level === 1
        ? "border-warning/60 bg-warning/10 hover:border-warning"
        : "border-border bg-surface hover:border-border-strong";

  function activate() {
    if (!item.filePath) return;
    // Vídeo abre o player aqui mesmo; documento vai para a aba nova, o mesmo
    // comportamento da vitrine.
    if (isVideo) return onPlay();
    window.open(item.filePath, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <button
        type="button"
        onClick={activate}
        disabled={!item.filePath}
        aria-label={
          level > 0 ? `${item.title} — reprovado, assistir novamente` : `${item.title} — abrir`
        }
        className={cn(
          "focus-ring flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
          tone,
          !item.filePath && "cursor-default opacity-60",
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            level === 2
              ? "bg-danger/20 text-danger"
              : level === 1
                ? "bg-warning/20 text-warning"
                : isVideo
                  ? "bg-primary/15 text-primary"
                  : "bg-info/15 text-info",
          )}
        >
          {level > 0 ? (
            <AlertTriangle className="h-4 w-4" />
          ) : isVideo ? (
            <PlayCircle className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-foreground">{item.title}</h4>
          <p className="truncate text-xs text-muted">
            {item.sector} · {item.meta}
          </p>
        </div>

        {level > 0 ? (
          <Badge tone={level === 2 ? "danger" : "warning"} className="shrink-0">
            Refazer
          </Badge>
        ) : (
          <Badge tone={isVideo ? "primary" : "info"} className="shrink-0">
            {isVideo ? "Vídeo" : "Documento"}
          </Badge>
        )}
      </button>

      {level === 2 && <p className="mt-1.5 px-3 text-xs text-muted">{REDO_MESSAGE}</p>}
    </div>
  );
}

/** Separador de grupo dentro da página, com o total do grupo na lista inteira. */
function GroupLabel({ label, count }: { label: string; count: number }) {
  const redo = label === REDO_GROUP;
  return (
    <div className="mb-2.5 mt-6 flex items-center gap-2 first:mt-0">
      <h4
        className={cn(
          "text-[11px] font-semibold uppercase tracking-widest",
          redo ? "text-warning" : "text-muted",
        )}
      >
        {label}
      </h4>
      <span
        className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium",
          redo ? "bg-warning/20 text-warning" : "bg-surface-3 text-muted",
        )}
      >
        {count}
      </span>
    </div>
  );
}

export function PendingContent({ groups }: { groups: readonly PendingCategory[] }) {
  /*
   * O player NÃO mora dentro da linha, e isso não é organização: era a causa
   * de o formulário de estrelas piscar e sumir. Enviar a resposta conclui o
   * vídeo e revalida a rota; o item sai das pendências no mesmo instante e
   * levava consigo a linha, o modal e tudo o que estava aberto dentro dele.
   *
   * Por isso o que se guarda aqui é uma CÓPIA do item, não o id: quando a
   * lista já não tem mais aquele vídeo, o player continua tendo. É o mesmo
   * arranjo de `my-evaluations-panel`, onde o modal vive no painel.
   */
  const [playing, setPlaying] = useState<PendingItem | null>(null);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => flattenPending(groups), [groups]);
  // Totais por grupo da lista INTEIRA: o separador informa o tamanho do grupo,
  // não quantos dele calharam de cair nesta página.
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.group, (map.get(row.group) ?? 0) + 1);
    return map;
  }, [rows]);

  // `paginate` puxa a página para dentro do intervalo: concluir o último item
  // da página 4 não deixa ninguém olhando para uma página vazia.
  const current = paginate(rows, page, PENDING_PAGE_SIZE);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Pendências por categoria</h3>
        <span className="text-xs text-muted">{rows.length} itens a concluir</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Tudo em dia"
          description="Você concluiu todo o conteúdo das suas áreas. Quando algo novo for publicado, aparece aqui."
        />
      ) : (
        <>
          <div>
            {current.items.map((row, i) => (
              <div key={row.item.id}>
                {/* O rótulo reaparece no alto de cada página, e a cada troca de
                    grupo dentro dela. */}
                {(i === 0 || current.items[i - 1]?.group !== row.group) && (
                  <GroupLabel label={row.group} count={totals.get(row.group) ?? 0} />
                )}
                <div className="mb-2">
                  <ItemRow item={row.item} onPlay={() => setPlaying(row.item)} />
                </div>
              </div>
            ))}
          </div>

          <Pagination
            page={current}
            onChange={setPage}
            noun="pendências"
            className="mt-4 border-t border-border pt-4"
          />
        </>
      )}

      {playing && (
        <PendingItemPlayer item={playing} open onClose={() => setPlaying(null)} />
      )}
    </section>
  );
}
