"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BRAND,
  BRAND_ORDER,
  FORMAT_LABEL,
  FORMAT_ORDER,
  FUNNEL,
  FUNNEL_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
} from "@/lib/funnel";
import { createContentPost, updateContentPost } from "@/lib/cronograma-actions";
import type {
  ContentBrand,
  ContentFormat,
  ContentPostItem,
  ContentStatus,
  FunnelStage,
  PostOwner,
} from "@/types/cronograma";

export interface PostModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  /** Post em edição; ausente = criação. */
  post?: ContentPostItem | null;
  /** Data pré-selecionada ao criar a partir de uma célula do calendário. */
  defaultDate?: string;
  people: readonly PostOwner[];
}

/**
 * Novo post ou edição de um existente.
 *
 * O formulário deixou de ser a porta de entrada do card: clicar num post abre
 * o modal de DETALHES, e é de lá que se chega aqui pelo botão "Editar".
 * Excluir também mora nos detalhes — este modal só cria e altera.
 *
 * Criar é liberado para qualquer usuário. Editar exige autoria: se o post não
 * for do usuário (rota alternativa, link direto), o formulário abre travado,
 * em leitura.
 */
export function PostModal({
  slug,
  open,
  onClose,
  post = null,
  defaultDate,
  people,
}: PostModalProps) {
  const router = useRouter();
  const editing = Boolean(post);
  // Post existente que não é do usuário: leitura apenas.
  const readOnly = editing && post?.canEdit === false;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [funnel, setFunnel] = useState<FunnelStage>("TOFU");
  const [format, setFormat] = useState<ContentFormat>("REEL");
  const [status, setStatus] = useState<ContentStatus>("IDEIA");
  const [brand, setBrand] = useState<ContentBrand | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTitle(post?.title ?? "");
    setDate(post?.date ?? defaultDate ?? "");
    setTime(post?.time ?? "09:00");
    setFunnel(post?.funnel ?? "TOFU");
    setFormat(post?.format ?? "REEL");
    setStatus(post?.status ?? "IDEIA");
    setBrand(post?.brand ?? null);
    setOwnerId(post?.owner?.id ?? "");
    setNotes(post?.notes ?? "");
    setError(null);
  }, [open, post, defaultDate]);

  function handleClose() {
    if (pending) return;
    onClose();
  }

  function submit() {
    setError(null);
    start(async () => {
      const payload = {
        slug,
        title: title.trim(),
        date,
        time,
        funnel,
        format,
        status,
        brand: brand ?? undefined,
        ownerId: ownerId || undefined,
        notes: notes.trim() || undefined,
      };

      const res = post
        ? await updateContentPost({ ...payload, id: post.id })
        : await createContentPost(payload);

      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao salvar o post.");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-lg">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">
          {readOnly ? "Detalhes do post" : editing ? "Editar post" : "Novo conteúdo"}
        </h2>
        {readOnly ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-warning">
            <Lock className="h-3.5 w-3.5" />
            Só o autor pode editar este conteúdo.
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted">
            O alcance da atividade é definido pela aba em que ela é criada e não muda depois.
          </p>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="post-title">Título</Label>
            <Input
              id="post-title"
              value={title}
              disabled={readOnly}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Lançamento LOVCLUB"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="post-date">Data</Label>
              <Input
                id="post-date"
                type="date"
                value={date}
                disabled={readOnly}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="post-time">Horário</Label>
              <Input
                id="post-time"
                type="time"
                value={time}
                disabled={readOnly}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Etapa do funil</Label>
            <div className="grid grid-cols-3 gap-2">
              {FUNNEL_ORDER.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setFunnel(stage)}
                  className={cn(
                    "focus-ring rounded-lg border px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-60",
                    funnel === stage
                      ? FUNNEL[stage].badge
                      : "border-border bg-surface-2 text-muted hover:text-foreground",
                  )}
                >
                  {FUNNEL[stage].short}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="post-format">Formato</Label>
              <select
                id="post-format"
                value={format}
                disabled={readOnly}
                onChange={(e) => setFormat(e.target.value as ContentFormat)}
                className="focus-ring h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground"
              >
                {FORMAT_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {FORMAT_LABEL[option]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="post-status">Status</Label>
              <select
                id="post-status"
                value={status}
                disabled={readOnly}
                onChange={(e) => setStatus(e.target.value as ContentStatus)}
                className="focus-ring h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground"
              >
                {STATUS_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABEL[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Marca (opcional)</Label>
            <div className="grid grid-cols-2 gap-2">
              {BRAND_ORDER.map((option) => {
                const active = brand === option;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={readOnly}
                    // Clicar de novo limpa: a marca é opcional.
                    onClick={() => setBrand(active ? null : option)}
                    style={{
                      backgroundColor: active ? BRAND[option].background : undefined,
                      borderColor: active ? BRAND[option].border : undefined,
                      color: active ? BRAND[option].foreground : undefined,
                    }}
                    className={cn(
                      "focus-ring flex items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors disabled:opacity-60",
                      !active && "border-border bg-surface-2 text-muted hover:text-foreground",
                    )}
                  >
                    <span
                      className="h-3 w-3 rounded-full border"
                      style={{
                        backgroundColor: BRAND[option].background,
                        borderColor: BRAND[option].border,
                      }}
                    />
                    {BRAND[option].label}
                  </button>
                );
              })}
            </div>
            {brand && !readOnly && (
              <button
                type="button"
                onClick={() => setBrand(null)}
                className="focus-ring mt-1.5 text-[11px] text-muted underline-offset-2 hover:underline"
              >
                Remover marca
              </button>
            )}
          </div>

          <div>
            <Label htmlFor="post-owner">Responsável</Label>
            <select
              id="post-owner"
              value={ownerId}
              disabled={readOnly}
              onChange={(e) => setOwnerId(e.target.value)}
              className="focus-ring h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground"
            >
              <option value="">Sem responsável</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="post-notes">Observações</Label>
            <Textarea
              id="post-notes"
              value={notes}
              disabled={readOnly}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Roteiro, referências, CTA…"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleClose} disabled={pending} className="h-11">
              {readOnly ? "Fechar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button onClick={submit} disabled={pending} className="h-11">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending ? "Salvando" : "Salvar"}
              </Button>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}
