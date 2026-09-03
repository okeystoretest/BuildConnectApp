"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/providers/toast-provider";
import { listFormRecipients, publishForm } from "@/lib/forms/actions";

export interface PublishModalProps {
  open: boolean;
  formId: string;
  onClose: () => void;
  /** Publicado com sucesso: o construtor recarrega em modo travado. */
  onPublished: () => void;
}

interface Recipients {
  users: { id: string; name: string; sector: string }[];
  sectors: { id: string; label: string }[];
}

/**
 * Lista de escolha com busca.
 *
 * Não usa o `MultiChipGroup` do design system porque ele trabalha com rótulos
 * — aqui o valor é um id e o rótulo, um nome de pessoa. Os chips repetem o
 * mesmo desenho para a tela não destoar.
 */
function Picker({
  label,
  items,
  values,
  onChange,
  searchPlaceholder,
  empty,
}: {
  label: string;
  items: { id: string; label: string; hint?: string }[];
  values: string[];
  onChange: (values: string[]) => void;
  searchPlaceholder: string;
  empty: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || (i.hint ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  function toggle(id: string) {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {values.length > 0 && (
          <span className="text-xs text-muted">{values.length} selecionado(s)</span>
        )}
      </div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className="mb-2"
      />
      {items.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <div
          role="group"
          aria-label={label}
          className="scrollbar-slim flex max-h-44 flex-wrap gap-2 overflow-y-auto p-0.5"
        >
          {filtered.map((item) => {
            const selected = values.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={selected}
                onClick={() => toggle(item.id)}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-3 text-muted hover:border-border-strong hover:text-foreground",
                )}
              >
                {selected && <Check className="h-3 w-3" />}
                {item.label}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-xs text-muted">Nada encontrado.</p>}
        </div>
      )}
    </div>
  );
}

export function PublishModal({ open, formId, onClose, onPublished }: PublishModalProps) {
  const { success, error } = useToast();
  const [data, setData] = useState<Recipients | null>(null);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [dueAt, setDueAt] = useState("");
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listFormRecipients().then((res) => {
      if (alive) setData(res);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  function handlePublish() {
    if (userIds.length === 0 && sectorIds.length === 0) {
      error("Escolha ao menos um destinatário.");
      return;
    }
    startSubmit(async () => {
      const res = await publishForm({
        formId,
        userIds,
        sectorIds,
        anonymous,
        dueAt: dueAt || undefined,
      });
      if (res.ok) {
        success("Formulário publicado");
        onPublished();
      } else {
        error(res.error ?? "Não foi possível publicar o formulário.");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-2xl" dismissible={!submitting}>
      <div className="flex max-h-[92vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Formulário do DHO
            </p>
            <h2 className="mt-1.5 text-xl font-bold text-foreground">Publicar formulário</h2>
            <p className="mt-1 text-sm text-muted">
              Quem for escolhido recebe a pendência em &quot;Minhas Avaliações&quot;.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scrollbar-slim flex-1 space-y-5 overflow-y-auto p-6">
          {!data ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando destinatários…
            </div>
          ) : (
            <>
              <Picker
                label="Setores"
                items={data.sectors.map((s) => ({ id: s.id, label: s.label }))}
                values={sectorIds}
                onChange={setSectorIds}
                searchPlaceholder="Buscar setor"
                empty="Nenhum setor disponível."
              />

              <Picker
                label="Pessoas"
                items={data.users.map((u) => ({ id: u.id, label: u.name, hint: u.sector }))}
                values={userIds}
                onChange={setUserIds}
                searchPlaceholder="Buscar pessoa por nome ou setor"
                empty="Nenhuma pessoa disponível."
              />

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    Respostas anônimas
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    Ninguém, nem o DHO, saberá quem respondeu o quê. Você continua vendo quem
                    ainda não respondeu.
                  </span>
                </span>
              </label>

              <div>
                <label
                  htmlFor="form-due-at"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Prazo (opcional)
                </label>
                <Input
                  id="form-due-at"
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted">
                  Informativo. Quem fecha o formulário é o encerramento, não a data.
                </p>
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border p-5">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handlePublish} disabled={submitting || !data}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? "Publicando" : "Publicar"}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
