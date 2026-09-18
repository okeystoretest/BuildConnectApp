"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, Loader2, Plus, Share2, Upload, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_BYTES, maxMb, validateUploadSizes } from "@/lib/storage/limits";
import { useRole } from "@/providers/role-provider";
import { listVideoShareTargets } from "@/lib/sector-actions";

/** O que fazer com a transcrição ao salvar. */
export type TranscriptMode = "keep" | "replace" | "remove";

export interface MediaEditValue {
  title: string;
  tags: readonly string[];
  /** Só existe quando o modal foi aberto com `transcript`. */
  transcriptMode?: TranscriptMode;
  transcriptFile?: File | null;
  /** Só existe quando o modal foi aberto com `sharing`. */
  shareWith?: readonly string[];
}

export interface MediaEditModalProps {
  open: boolean;
  onClose: () => void;
  initial: MediaEditValue;
  /** Sugestões existentes no setor, para reaproveitar filtros. */
  suggestions?: readonly string[];
  /**
   * Presente só para vídeos: mostra o campo de transcrição. `hasCurrent`
   * diz se o vídeo já tem uma, para oferecer "substituir" e "remover".
   */
  transcript?: { hasCurrent: boolean };
  /**
   * Presente só para vídeos de Instruções: habilita "Compartilhar com".
   * `current` são os ids dos subsetores que já recebem o vídeo.
   */
  sharing?: { slug: string; current: readonly string[] };
  /** true enquanto o salvamento roda — trava os botões e o fechar. */
  saving?: boolean;
  /** Erro vindo do servidor, exibido dentro do modal. */
  serverError?: string | null;
  onSave: (value: MediaEditValue) => void;
}

const TRANSCRIPT_ACCEPT = ".txt,.md,.vtt,.srt,text/plain,text/vtt,text/markdown";

/**
 * Edição de vídeo/documento: título e tags — e, nos vídeos, a transcrição.
 * As tags alimentam as pílulas de filtro — vincular aqui é o que
 * faz a filtragem dinâmica funcionar. A transcrição entra AQUI, e não no
 * envio: o lote nasce só com vídeo e título.
 */
export function MediaEditModal({
  open,
  onClose,
  initial,
  suggestions = [],
  transcript,
  sharing,
  saving = false,
  serverError = null,
  onSave,
}: MediaEditModalProps) {
  const [title, setTitle] = useState(initial.title);
  const [tags, setTags] = useState<readonly string[]>(initial.tags);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [transcriptMode, setTranscriptMode] = useState<TranscriptMode>("keep");
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);

  const { role } = useRole();
  const canShare = Boolean(sharing) && role === "ADMIN";
  const [targets, setTargets] = useState<{ id: string; label: string; sector: string }[]>([]);
  const [shareWith, setShareWith] = useState<readonly string[]>(sharing?.current ?? []);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState(false);

  // Recarrega ao abrir sobre outro item.
  useEffect(() => {
    if (open) {
      setTitle(initial.title);
      setTags(initial.tags);
      setDraft("");
      setError(null);
      setTranscriptMode("keep");
      setTranscriptFile(null);
    }
  }, [open, initial.title, initial.tags]);

  // A lista de subsetores vem do servidor ao abrir, e só para quem pode
  // compartilhar: o modal serve a todo card e não deve puxar isso à toa.
  useEffect(() => {
    if (!open || !canShare || !sharing) return;
    setShareWith(sharing.current);
    let alive = true;
    setLoadingTargets(true);
    setTargetsError(false);
    void listVideoShareTargets(sharing.slug)
      .then((rows) => alive && setTargets(rows))
      .catch(() => {
        // Se a listagem falhar, não mostrar "nenhum setor disponível" — isso
        // pareceria que a área não tem destino, em vez de dizer que a busca deu errado.
        if (alive) {
          setTargets([]);
          setTargetsError(true);
        }
      })
      .finally(() => alive && setLoadingTargets(false));
    return () => {
      alive = false;
    };
  }, [open, canShare, sharing]);

  function toggleShare(id: string) {
    setShareWith((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addTag(value: string) {
    const clean = value.trim();
    if (!clean) return;
    if (!tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setTags([...tags, clean]);
    }
    setDraft("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleSave() {
    if (!title.trim()) {
      setError("O título não pode ficar vazio.");
      return;
    }
    if (transcript && transcriptMode === "replace") {
      if (!transcriptFile) {
        setError("Selecione o arquivo da transcrição.");
        return;
      }
      const excedeu = validateUploadSizes([
        { label: "A transcrição", bytes: transcriptFile.size, max: MAX_BYTES.transcript },
      ]);
      if (excedeu) {
        setError(excedeu);
        return;
      }
    }
    onSave({
      title: title.trim(),
      tags,
      ...(transcript ? { transcriptMode, transcriptFile } : {}),
      ...(canShare ? { shareWith } : {}),
    });
    // Quem salva no servidor fecha o modal quando terminar; sem servidor
    // (documentos, por ora), fecha aqui mesmo.
    if (!transcript) onClose();
  }

  /** Rótulo do estado da transcrição, para o campo dizer o que vai acontecer. */
  function transcriptStatus(): string {
    if (transcriptMode === "replace" && transcriptFile) return transcriptFile.name;
    if (transcriptMode === "remove") return "A transcrição será removida ao salvar.";
    if (transcript?.hasCurrent) return "Transcrição enviada.";
    return "Nenhuma transcrição enviada.";
  }

  const available = suggestions.filter((s) => !tags.includes(s));

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="Editar conteúdo"
      description={
        canShare
          ? "Altere o título, os filtros, a transcrição e com quem o vídeo é compartilhado."
          : transcript
            ? "Altere o título, os filtros e a transcrição."
            : "Altere o título e as tags de filtragem."
      }
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div>
          <Label htmlFor="media-title">Título</Label>
          <Input
            id="media-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            className="h-11 rounded-xl"
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>

        <div>
          <Label htmlFor="media-tag">Tags / filtros</Label>
          <div className="flex gap-2">
            <Input
              id="media-tag"
              value={draft}
              placeholder="Ex.: Segurança"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(draft);
                }
              }}
              className="h-10 rounded-lg"
            />
            <Button variant="secondary" onClick={() => addTag(draft)} className="shrink-0">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>

          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remover tag ${tag}`}
                    className="focus-ring rounded-full text-primary/70 transition-colors hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {available.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] text-muted">Sugestões do setor:</p>
              <div className="flex flex-wrap gap-2">
                {available.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => addTag(suggestion)}
                    className="focus-ring rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {transcript && (
          <div>
            <Label htmlFor="media-transcript">Transcrição do Vídeo</Label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
              <Captions className="h-4 w-4 shrink-0 text-muted" />
              <p className="min-w-0 flex-1 truncate text-xs text-muted">{transcriptStatus()}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => transcriptInputRef.current?.click()}
                disabled={saving}
              >
                <Upload className="h-3.5 w-3.5" />
                {transcript.hasCurrent || transcriptFile ? "Substituir" : "Enviar"}
              </Button>
              {(transcriptMode === "replace" ||
                (transcript.hasCurrent && transcriptMode === "keep")) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setTranscriptFile(null);
                    // Sem transcrição atual, desfazer a escolha volta ao "nada";
                    // com uma atual, o pedido é remover a que existe.
                    setTranscriptMode(transcript.hasCurrent ? "remove" : "keep");
                  }}
                >
                  {transcriptMode === "replace" && !transcript.hasCurrent ? "Desfazer" : "Remover"}
                </Button>
              )}
            </div>
            <input
              id="media-transcript"
              ref={transcriptInputRef}
              type="file"
              accept={TRANSCRIPT_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (!file) return;
                setError(null);
                setTranscriptFile(file);
                setTranscriptMode("replace");
              }}
            />
            <p className="mt-1.5 text-[11px] text-muted">
              TXT, MD, VTT ou SRT, até {maxMb("transcript")} MB. O texto aparece ao lado do player.
            </p>
          </div>
        )}

        {canShare && (
          <div>
            <Label>Compartilhar com outros setores</Label>
            <p className="mb-2 text-[11px] text-muted">
              O mesmo arquivo passa a aparecer nas Instruções em Vídeo dos setores marcados. Só
              este setor edita ou exclui.
            </p>
            {loadingTargets ? (
              <p className="text-xs text-muted">Carregando setores…</p>
            ) : targetsError ? (
              <p className="text-xs text-danger">
                Não foi possível carregar os setores. Feche e abra de novo.
              </p>
            ) : targets.length === 0 ? (
              <p className="text-xs text-muted">Nenhum outro setor disponível.</p>
            ) : (
              <div className="scrollbar-slim max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2">
                {targets.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-surface-3"
                  >
                    <input
                      type="checkbox"
                      checked={shareWith.includes(t.id)}
                      onChange={() => toggleShare(t.id)}
                      disabled={saving}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0 truncate">
                      {t.label}
                      <span className="ml-1 text-xs text-muted">· {t.sector}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {shareWith.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                <Share2 className="h-3 w-3" /> Compartilhado com {shareWith.length} setor(es).
              </p>
            )}
          </div>
        )}

        {serverError && <p className="text-xs text-danger">{serverError}</p>}
      </div>
    </Modal>
  );
}
