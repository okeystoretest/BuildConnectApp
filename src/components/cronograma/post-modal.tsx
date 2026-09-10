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
  FORMAT,
  FORMAT_LABEL,
  FORMAT_ORDER,
  FUNNEL,
  FUNNEL_ORDER,
  PLATFORM,
  PLATFORM_ORDER,
  formatStyle,
  platformStyle,
} from "@/lib/funnel";
import { PlatformIcon } from "@/components/cronograma/platform-icon";
import { createContentPost, updateContentPost } from "@/lib/cronograma-actions";
import {
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  VISIBILITY_ORDER,
  VISIBILITY_SHORT,
  defaultVisibilityForSlug,
} from "@/lib/cronograma-visibility";
import type {
  ContentBrand,
  ContentFormat,
  ContentPlatform,
  ContentPostItem,
  ContentVisibility,
  FunnelStage,
} from "@/types/cronograma";

export interface PostModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  /** Post em edição; ausente = criação. */
  post?: ContentPostItem | null;
  /** Data pré-selecionada ao criar a partir de uma célula do calendário. */
  defaultDate?: string;
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
 *
 * Dois campos saíram daqui de propósito:
 *
 *  - STATUS. Todo conteúdo nasce como "Ideia", e quem move a fila é o seletor
 *    da aba Backlog, onde o status é de fato acompanhado. Perguntá-lo na
 *    criação só produzia post nascendo "Publicado" por engano.
 *  - RESPONSÁVEL. É sempre quem cria. A lista de escolha, além de um passo a
 *    mais, trazia gente de outros setores.
 */
export function PostModal({
  slug,
  open,
  onClose,
  post = null,
  defaultDate,
}: PostModalProps) {
  const router = useRouter();
  const editing = Boolean(post);
  // Post existente que não é do usuário: leitura apenas.
  const readOnly = editing && post?.canEdit === false;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [funnel, setFunnel] = useState<FunnelStage>("TOFU");
  const [formats, setFormats] = useState<readonly ContentFormat[]>(["REEL"]);
  const [brand, setBrand] = useState<ContentBrand | null>(null);
  const [visibility, setVisibility] = useState<ContentVisibility>("SHARED");
  const [platforms, setPlatforms] = useState<readonly ContentPlatform[]>([]);
  const [formatOther, setFormatOther] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTitle(post?.title ?? "");
    setDate(post?.date ?? defaultDate ?? "");
    setTime(post?.time ?? "09:00");
    setFunnel(post?.funnel ?? "TOFU");
    // Post antigo pode ter chegado sem formato: a coluna virou lista, e lista
    // aceita vazio. Cai no padrão para o formulário nunca abrir sem seleção.
    setFormats(post?.formats?.length ? post.formats : ["REEL"]);
    setBrand(post?.brand ?? null);
    // Editando, o alcance é o do card. Criando, o padrão da aba.
    setVisibility(post?.visibility ?? defaultVisibilityForSlug(slug));
    setPlatforms(post?.platforms ?? []);
    setFormatOther(post?.formatOther ?? "");
    setNotes(post?.notes ?? "");
    setError(null);
  }, [open, post, defaultDate, slug]);

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
        // Ordem canonica em ambas as listas; o formulario so define quais.
        formats: FORMAT_ORDER.filter((option) => formats.includes(option)),
        brand: brand ?? undefined,
        platforms: PLATFORM_ORDER.filter((option) => platforms.includes(option)),
        formatOther: formats.includes("OUTRO") ? formatOther.trim() : undefined,
        notes: notes.trim() || undefined,
        visibility,
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <div>
            <Label>Formato</Label>
            {/* Selecao MULTIPLA: a mesma peca costuma sair em mais de um
                formato (um Reel que tambem vira Story). Antes era escolha
                unica, e registrar isso exigia duplicar o post — que entao
                contava duas vezes no volume do funil.

                Cada formato tem cor propria — a mesma que identifica a tag no
                calendario, no backlog e nos detalhes. */}
            <div className="flex flex-wrap gap-2">
              {FORMAT_ORDER.map((option) => {
                const active = formats.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role="checkbox"
                    disabled={readOnly}
                    aria-checked={active}
                    onClick={() =>
                      setFormats((prev) =>
                        prev.includes(option)
                          ? prev.filter((value) => value !== option)
                          : [...prev, option],
                      )
                    }
                    style={active ? formatStyle(option) : undefined}
                    className={cn(
                      "focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60",
                      !active && "border-border bg-surface-2 text-muted hover:text-foreground",
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: FORMAT[option].color }}
                    />
                    {FORMAT_LABEL[option]}
                  </button>
                );
              })}
            </div>

            {/* "Outro" so existe com o nome que a pessoa der. */}
            {formats.includes("OUTRO") && (
              <div className="mt-2">
                <Label htmlFor="post-format-other">Qual formato?</Label>
                <Input
                  id="post-format-other"
                  value={formatOther}
                  disabled={readOnly}
                  onChange={(e) => setFormatOther(e.target.value)}
                  placeholder="Ex.: Newsletter, Podcast, Evento presencial…"
                  maxLength={60}
                />
              </div>
            )}
          </div>

          <div>
            <Label>Redes sociais (opcional)</Label>
            {/* Selecao MULTIPLA: a mesma peca costuma ir ao ar em mais de uma
                rede. Cada botao veste a cor institucional da plataforma. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PLATFORM_ORDER.map((option) => {
                const active = platforms.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role="checkbox"
                    disabled={readOnly}
                    aria-checked={active}
                    onClick={() =>
                      setPlatforms((prev) =>
                        prev.includes(option)
                          ? prev.filter((value) => value !== option)
                          : [...prev, option],
                      )
                    }
                    style={active ? platformStyle(option) : undefined}
                    className={cn(
                      "focus-ring flex items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors disabled:opacity-60",
                      !active && "border-border bg-surface-2 text-muted hover:text-foreground",
                    )}
                  >
                    <PlatformIcon platform={option} className="h-4 w-4 shrink-0" />
                    {PLATFORM[option].label}
                  </button>
                );
              })}
            </div>
            {platforms.length > 0 && !readOnly && (
              <button
                type="button"
                onClick={() => setPlatforms([])}
                className="focus-ring mt-1.5 text-[11px] text-muted underline-offset-2 hover:underline"
              >
                Limpar redes sociais
              </button>
            )}
          </div>

          <div>
            <Label>Marca (opcional)</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

          {/* Alcance: quem vai enxergar este card. Fica DEPOIS dos campos do
              conteúdo porque é decisão de publicação, não de produção — e
              antes das observações para não passar despercebido no fim. */}
          <div>
            <Label>Quem vê este conteúdo</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {VISIBILITY_ORDER.map((option) => {
                const active = visibility === option;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setVisibility(option)}
                    aria-pressed={active}
                    title={VISIBILITY_HINT[option]}
                    className={cn(
                      "focus-ring flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-colors disabled:opacity-60",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-surface-2 text-muted hover:text-foreground",
                    )}
                  >
                    <span className="text-xs font-semibold">{VISIBILITY_LABEL[option]}</span>
                    <span className="text-[10px] leading-tight">{VISIBILITY_SHORT[option]}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              {VISIBILITY_HINT[visibility]}
            </p>
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
