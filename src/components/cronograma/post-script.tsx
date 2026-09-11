"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generatePostScript, savePostScript } from "@/lib/ai/script-actions";
import { SCRIPT_MAX } from "@/lib/ai/scopes";
import type { ContentPostItem } from "@/types/cronograma";

export interface PostScriptProps {
  slug: string;
  post: ContentPostItem;
  /** Há chave do Gemini salva? Sem ela, nada de IA aparece. */
  aiReady: boolean;
  /** Outra ação do modal (excluir) está em andamento. */
  busy: boolean;
  /** Avisa o modal que gerar/salvar começou ou terminou. */
  onBusyChange: (busy: boolean) => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

/**
 * Seção "Roteiro" do modal de detalhes.
 *
 * Seis estados, cruzando `aiReady` × `post.script` × `post.canEdit` (tabela
 * na spec §6.2). Em resumo: sem chave, só o que já foi salvo aparece; com
 * chave, quem edita o card gera e regera; quem só lê, só lê.
 *
 * Gerar e salvar terminam em `router.refresh()`: o modal relê o post de
 * `data.posts`, então o texto novo chega sem estado local duplicado.
 * Falha de IA fica na faixa vermelha e o texto anterior permanece.
 */
export function PostScript({ slug, post, aiReady, busy, onBusyChange }: PostScriptProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.script ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Post trocou (outro card) ou chegou texto novo: recomeça do zero.
  useEffect(() => {
    setConfirming(false);
    setEditing(false);
    setDraft(post.script ?? "");
    setError(null);
  }, [post.id, post.script]);

  useEffect(() => onBusyChange(pending), [pending, onBusyChange]);

  const hasScript = Boolean(post.script);
  const canGenerate = aiReady && post.canEdit;
  const disabled = pending || busy;

  function generate() {
    setError(null);
    setConfirming(false);
    start(async () => {
      const res = await generatePostScript({ id: post.id, slug });
      if (res.ok) router.refresh();
      else setError(res.error ?? "Falha ao gerar o roteiro.");
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await savePostScript({ id: post.id, slug, body: draft });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao salvar o roteiro.");
      }
    });
  }

  // Nada a mostrar: sem roteiro salvo e sem como gerar.
  if (!hasScript && !canGenerate) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <Sparkles className="h-3 w-3" />
          Roteiro
        </p>
        {hasScript && post.canEdit && !editing && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={disabled}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
            {aiReady && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={disabled}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Gerar novamente
              </Button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <Textarea
            rows={10}
            maxLength={SCRIPT_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            className="text-[13px] leading-relaxed"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">
              {draft.length} / {SCRIPT_MAX}
              {draft.trim().length === 0 && " · salvar vazio remove o roteiro"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(post.script ?? "");
                  setError(null);
                }}
                disabled={disabled}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={save} disabled={disabled}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      ) : hasScript ? (
        <>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {post.script}
          </p>
          {post.scriptUpdatedAt && (
            <p className="mt-2 text-[11px] text-muted">
              Gerado por {post.scriptAuthorName ?? "—"} · {formatWhen(post.scriptUpdatedAt)}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-sm text-muted">
          Nenhum roteiro ainda. Clique em <span className="font-semibold">Roteiro</span> para a
          IA escrever um a partir dos campos deste card.
        </p>
      )}

      {pending && !editing && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Gerando roteiro… isso leva alguns segundos.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {confirming && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="text-sm text-foreground">
            Gerar novamente substitui o roteiro atual. Continuar?
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={disabled}
            >
              Manter
            </Button>
            <Button size="sm" onClick={generate} disabled={disabled}>
              <Sparkles className="h-3.5 w-3.5" />
              Gerar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * O botão da barra de ações — só quando ainda NÃO há roteiro. Depois que
 * existe, gerar de novo é o "Gerar novamente" da seção, com confirmação.
 *
 * O erro sobe para o modal (`onError`), que já tem a faixa de erro do
 * Excluir — assim não há duas faixas vermelhas na mesma tela.
 */
export function GenerateScriptButton({
  slug,
  post,
  aiReady,
  busy,
  onBusyChange,
  onError,
}: PostScriptProps & { onError: (message: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => onBusyChange(pending), [pending, onBusyChange]);

  if (!aiReady || !post.canEdit || post.script) return null;

  function generate() {
    start(async () => {
      const res = await generatePostScript({ id: post.id, slug });
      if (res.ok) router.refresh();
      else onError(res.error ?? "Falha ao gerar o roteiro.");
    });
  }

  return (
    <Button variant="outline" onClick={generate} disabled={pending || busy} className="h-11">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {pending ? "Gerando…" : "Roteiro"}
    </Button>
  );
}
