"use client";

import { useState } from "react";
import { Clock, Lock, Minus, Plus, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BRAND,
  FORMAT_LABEL,
  FUNNEL,
  STATUS_LABEL,
  WEEKDAY_LONG,
  resolveBrand,
} from "@/lib/funnel";
import type { ContentPostItem } from "@/types/cronograma";

export type CalendarView = "month" | "week" | "day";

export interface ContentCalendarProps {
  /** Dias visíveis, em ISO (yyyy-mm-dd), sempre iniciando na segunda. */
  days: readonly string[];
  /** Mês em foco (1–12) — dias fora dele aparecem esmaecidos. */
  month: number;
  view: CalendarView;
  posts: readonly ContentPostItem[];
  today: string;
  /**
   * Tela cheia: a grade estica para ocupar toda a altura disponível e as
   * semanas dividem o espaço igualmente. Dentro da célula, os cards dividem a
   * altura entre si — nada rola, nem a célula nem o card. Sem isso, "tela
   * cheia" seria só fundo vazio.
   */
  fill?: boolean;
  onCreate: (date: string) => void;
  /** Clique no card: abre o modal de DETALHES (não o formulário). */
  onSelect: (post: ContentPostItem) => void;
}

function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

/** Resumo da observação exibido no card — o texto completo fica no modal. */
function notesSummary(notes?: string): string | null {
  if (!notes) return null;
  const flat = notes.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

/** Estilo do card quando há marca — os dois tons de marca são claros. */
function brandStyle(post: ContentPostItem) {
  const key = resolveBrand(post.brand);
  return key ? BRAND[key] : null;
}

/**
 * Chip de post (estado padrão).
 *
 * É um `div` clicável, não um `<button>`: o botão de expandir mora dentro
 * dele, e botão dentro de botão é HTML inválido — o navegador desmonta a
 * árvore e o clique interno se perde.
 *
 * Abaixo do título vai o RESUMO das observações: duas linhas no máximo, o
 * suficiente para reconhecer o conteúdo sem abrir nada.
 */
function PostChip({
  post,
  onSelect,
  onExpand,
}: {
  post: ContentPostItem;
  onSelect: (post: ContentPostItem) => void;
  onExpand: (post: ContentPostItem) => void;
}) {
  const brand = brandStyle(post);
  const summary = notesSummary(post.notes);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(post);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(post);
      }}
      style={
        brand
          ? {
              backgroundColor: brand.background,
              borderColor: brand.border,
              color: brand.foreground,
            }
          : undefined
      }
      className={cn(
        "focus-ring w-full cursor-pointer rounded-lg border p-2 text-left transition-colors",
        brand ? "hover:brightness-95" : "border-border bg-surface-2 hover:border-border-strong",
      )}
    >
      <span className="flex items-start gap-1.5">
        <span
          aria-hidden
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: FUNNEL[post.funnel].color }}
        />
        <span
          className={cn(
            "line-clamp-2 text-[11px] font-medium leading-tight",
            !brand && "text-foreground",
          )}
        >
          {post.title}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {!post.canEdit && (
            <Lock
              className="mt-0.5 h-3 w-3 opacity-50"
              aria-label="Somente o autor pode editar"
            />
          )}
          {/* Expande o card dentro da própria célula do dia. */}
          <button
            type="button"
            aria-label={`Expandir ${post.title}`}
            title="Expandir card"
            onClick={(e) => {
              e.stopPropagation();
              onExpand(post);
            }}
            className={cn(
              "focus-ring flex h-5 w-5 items-center justify-center rounded border transition-colors",
              brand
                ? "border-black/15 bg-white/50 hover:bg-white/70"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            <Plus className="h-3 w-3" />
          </button>
        </span>
      </span>

      {summary && (
        <span
          className={cn(
            "mt-1 block line-clamp-2 text-[10px] leading-snug",
            brand ? "opacity-80" : "text-muted",
          )}
          title={post.notes}
        >
          {summary}
        </span>
      )}

      <span className="mt-1.5 flex flex-wrap items-center gap-1">
        {brand ? (
          <>
            <span
              className="rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: "rgba(255,255,255,0.55)",
                color: brand.foreground,
              }}
            >
              {FORMAT_LABEL[post.format]}
            </span>
            <span
              className="rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: FUNNEL[post.funnel].color }}
            >
              {FUNNEL[post.funnel].short}
            </span>
            <span
              className="rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: "rgba(255,255,255,0.55)",
                color: brand.foreground,
              }}
            >
              {brand.label}
            </span>
          </>
        ) : (
          <>
            <span className="rounded border border-border bg-surface px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted">
              {FORMAT_LABEL[post.format]}
            </span>
            <span
              className={cn(
                "rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
                FUNNEL[post.funnel].badge,
              )}
            >
              {FUNNEL[post.funnel].short}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Card expandido.
 *
 * Ocupa EXATAMENTE a célula do dia (`inset-0`): mesma moldura, mesma área que
 * o calendário já reserva para aquela data. A grade não muda de tamanho —
 * nenhuma semana empurra a outra, nada quebra em tela cheia.
 *
 * Sem barra de rolagem, por decisão: o conteúdo se ajusta ao espaço. Cabeçalho,
 * selos e responsável são fixos e compactos; as observações ocupam a sobra
 * (`flex-1 min-h-0 overflow-hidden`) e, quando o texto passa da altura
 * disponível, um degradê no rodapé sinaliza a continuação em vez de cortar
 * seco. Em tela cheia, onde a célula é mais alta, aparece mais texto sem
 * mudar uma linha de código.
 *
 * Tipografia deliberadamente contida: legível de perto, sem virar um bloco
 * gigante dentro de uma célula de calendário. O texto integral está a um
 * clique, no modal de detalhes — clicar em qualquer ponto do card o abre.
 */
function ExpandedPostCard({
  post,
  variant,
  dense = false,
  onSelect,
  onCollapse,
}: {
  post: ContentPostItem;
  /**
   * "overlay": um card sobrepondo a célula inteira (visão normal, um por vez).
   * "inline": vários cards expandidos dividindo a altura da célula — é o que
   * a tela cheia usa, onde sobra espaço para todos.
   */
  variant: "overlay" | "inline";
  /**
   * Célula dividida entre muitos cards: reduz o título a uma linha e corta os
   * selos secundários. É o ajuste determinístico que substitui medir altura em
   * tempo de execução — sabemos quantos cards dividem a célula, então sabemos
   * quanto cabe em cada um.
   */
  dense?: boolean;
  onSelect: (post: ContentPostItem) => void;
  onCollapse: () => void;
}) {
  const brand = brandStyle(post);
  const notes = post.notes?.replace(/\s+\n/g, "\n").trim();

  /** Selo compacto: herda o contraste da marca quando há uma. */
  function Tag({ children, solid }: { children: React.ReactNode; solid?: string }) {
    return (
      <span
        className={cn(
          "rounded px-1 py-px text-[9px] font-semibold uppercase leading-tight tracking-wide",
          !brand && !solid && "border border-border bg-surface-2 text-muted",
          solid && "text-white",
        )}
        style={
          solid
            ? { backgroundColor: solid }
            : brand
              ? { backgroundColor: "rgba(255,255,255,0.55)", color: brand.foreground }
              : undefined
        }
      >
        {children}
      </span>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(post);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCollapse();
          return;
        }
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(post);
      }}
      style={
        brand
          ? {
              backgroundColor: brand.background,
              borderColor: brand.border,
              color: brand.foreground,
            }
          : undefined
      }
      className={cn(
        "flex cursor-pointer flex-col overflow-hidden border p-2",
        variant === "overlay"
          ? "absolute inset-0 z-20"
          : // Divide a altura da célula em partes iguais com os demais cards.
            //
            // `min-h-0` é o que faz isso funcionar: item de flex nasce com
            // `min-height: auto`, ou seja, se recusa a encolher abaixo do
            // próprio conteúdo — e transborda a célula em vez de dividir o
            // espaço. Sem `basis-0`, a divisão levaria em conta o tamanho do
            // texto e cada card sairia de um tamanho.
            //
            // Sem cantos arredondados e sem borda lateral: os cards ladrilham
            // a célula de borda a borda, com a mesma geometria do calendário.
            "w-full min-w-0 min-h-0 flex-1 basis-0 rounded-none border-x-0 border-b-0 border-t first:border-t-0",
        !brand && "border-border-strong bg-surface",
      )}
    >
      {/* Cabeçalho: data à esquerda, recolher à direita. O horário fica na
          linha do responsável — quem produz precisa dos dois juntos. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: FUNNEL[post.funnel].color }}
        />
        <span className={cn("text-[10px] font-semibold", !brand && "text-muted")}>
          {dayNumber(post.date)}/{post.date.slice(5, 7)}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {!post.canEdit && (
            <Lock className="h-3 w-3 opacity-50" aria-label="Somente o autor pode editar" />
          )}
          <button
            type="button"
            aria-label={`Recolher ${post.title}`}
            title="Recolher card"
            onClick={(e) => {
              e.stopPropagation();
              onCollapse();
            }}
            className={cn(
              "focus-ring flex h-5 w-5 items-center justify-center rounded border transition-colors",
              brand
                ? "border-black/15 bg-white/50 hover:bg-white/70"
                : "border-border bg-surface-2 text-muted hover:text-foreground",
            )}
          >
            <Minus className="h-3 w-3" />
          </button>
        </span>
      </div>

      {/* Título: até duas linhas, o suficiente para não empurrar o resto. */}
      <p
        className={cn(
          "mt-1 shrink-0 text-xs font-semibold leading-snug",
          dense ? "line-clamp-1" : "line-clamp-2",
          !brand && "text-foreground",
        )}
        title={post.title}
      >
        {post.title}
      </p>

      <div className="mt-1 flex shrink-0 flex-wrap items-center gap-1">
        <Tag solid={FUNNEL[post.funnel].color}>{FUNNEL[post.funnel].short}</Tag>
        <Tag>{FORMAT_LABEL[post.format]}</Tag>
        {/* Status e marca saem primeiro quando o espaço aperta: o funil e o
            formato identificam o post; os outros dois são complemento. */}
        {!dense && <Tag>{STATUS_LABEL[post.status]}</Tag>}
        {!dense && brand && <Tag>{brand.label}</Tag>}
      </div>

      {/* Horário planejado ao lado do responsável: quem faz e a que horas
          entra no ar são a mesma informação operacional. */}
      <p
        className={cn(
          "mt-1 flex shrink-0 items-center gap-1.5 text-[10px]",
          brand ? "opacity-80" : "text-muted",
        )}
      >
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          {post.time}
        </span>
        <span aria-hidden className="opacity-50">
          ·
        </span>
        <span className="inline-flex min-w-0 items-center gap-1">
          <UserIcon className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{post.owner?.name ?? "Sem responsável"}</span>
        </span>
      </p>

      {/* Observações: ocupam a sobra da célula. Sem rolagem — o excesso some
          sob um degradê, e o texto completo fica no modal de detalhes. */}
      <div className="relative mt-1.5 min-h-0 flex-1 overflow-hidden">
        <p
          className={cn(
            // 11px: um degrau acima dos selos, para o texto que mais se lê
            // dentro do card não ser o menor da tela.
            "whitespace-pre-wrap break-words text-[11px] leading-snug",
            brand ? "opacity-90" : "text-foreground",
            !notes && (brand ? "italic opacity-60" : "italic text-muted"),
          )}
        >
          {notes || "Sem observações."}
        </p>
        {notes && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-4"
            style={{
              // hsl(var(--bc-surface)) é a cor real do card sem marca nos dois
              // temas — o degradê acompanha claro/escuro sem condicional.
              backgroundImage: `linear-gradient(to bottom, transparent, ${
                brand ? brand.background : "hsl(var(--bc-surface))"
              })`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Grade do calendário. Mês, semana e dia compartilham a mesma célula — muda
 * só a quantidade de colunas e a altura mínima, o que mantém o comportamento
 * do chip idêntico nas três visões.
 *
 * Criar é liberado para qualquer usuário: clicar numa célula vazia abre o
 * formulário já com a data. A restrição de autoria vale só para editar.
 *
 * Expansão, dois regimes:
 *
 * - Visão normal: um card por vez, sobreposto à célula. Expandir outro recolhe
 *   o anterior — dois cards expandidos disputariam a mesma célula.
 * - Tela cheia (`fill`): TODOS já entram expandidos, lado a lado na vertical,
 *   dividindo a altura da célula em partes iguais. É o ponto da tela cheia —
 *   há espaço, então mostra-se tudo sem exigir um clique por card. O "−"
 *   recolhe o card individualmente; o "+" o traz de volta. Quantos mais cards
 *   dividem a célula, mais enxuto cada um fica (`dense`) — nunca uma barra de
 *   rolagem.
 *
 * `overrides` guarda só a EXCEÇÃO ao padrão do regime atual. Assim, ao entrar
 * ou sair da tela cheia, o padrão volta a valer sozinho, sem precisar limpar
 * estado nem sincronizar dois lugares.
 */
export function ContentCalendar({
  days,
  month,
  view,
  posts,
  today,
  fill = false,
  onCreate,
  onSelect,
}: ContentCalendarProps) {
  // Visão normal: um único card expandido por vez.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Tela cheia: exceções ao padrão "todos expandidos".
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());

  const isExpanded = (post: ContentPostItem) =>
    fill ? !collapsedIds.has(post.id) : expandedId === post.id;

  function expand(post: ContentPostItem) {
    if (!fill) {
      setExpandedId(post.id);
      return;
    }
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(post.id);
      return next;
    });
  }

  function collapse(post: ContentPostItem) {
    if (!fill) {
      setExpandedId(null);
      return;
    }
    setCollapsedIds((prev) => new Set(prev).add(post.id));
  }

  const byDate = new Map<string, ContentPostItem[]>();
  for (const post of posts) {
    const list = byDate.get(post.date);
    if (list) list.push(post);
    else byDate.set(post.date, [post]);
  }

  const columns = view === "day" ? 1 : 7;
  const minHeight = view === "month" ? "min-h-[150px]" : "min-h-[340px]";
  const rows = Math.max(1, Math.ceil(days.length / columns));

  return (
    // A grade ocupa toda a largura disponível; abaixo de ~900px ela rola na
    // horizontal em vez de espremer as células a ponto de esconder os cards.
    <div
      className={cn(
        "scrollbar-slim overflow-x-auto rounded-xl border border-border",
        fill && "flex h-full min-h-0 flex-col",
      )}
    >
      <div
        className={cn(
          "w-full",
          view !== "day" && "min-w-[900px]",
          fill && "flex min-h-0 flex-1 flex-col",
        )}
      >
        {view !== "day" && (
          <div className="grid grid-cols-7 border-b border-border bg-surface-2">
            {WEEKDAY_LONG.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
              >
                {label}
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            "grid",
            columns === 7 ? "grid-cols-7" : "grid-cols-1",
            fill && "min-h-0 flex-1",
          )}
          style={fill ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : undefined}
        >
          {days.map((iso) => {
            const dayPosts = byDate.get(iso) ?? [];
            const outside = monthOf(iso) !== month;
            const isToday = iso === today;
            // O card expandido só existe na célula do próprio dia.
            // Visão normal: no máximo um card sobreposto à célula.
            const overlay = fill
              ? null
              : (dayPosts.find((post) => post.id === expandedId) ?? null);

            return (
              <div
                key={iso}
                onClick={() => onCreate(iso)}
                className={cn(
                  "group relative flex cursor-pointer flex-col border-b border-r border-border p-2 transition-colors last:border-r-0",
                  fill ? "min-h-0" : minHeight,
                  outside ? "bg-surface-2/40" : "bg-surface",
                  "hover:bg-surface-2/70",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs font-semibold",
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : outside
                          ? "text-muted/60"
                          : "text-foreground",
                    )}
                  >
                    {dayNumber(iso)}
                  </span>
                  <span className="opacity-0 transition-opacity group-hover:opacity-100">
                    <Plus className="h-3.5 w-3.5 text-muted" />
                  </span>
                </div>

                <div
                  className={cn(
                    "space-y-1.5",
                    // Em tela cheia os cards cobrem a célula INTEIRA — a
                    // mesma geometria do card expandido na visão normal
                    // (`inset-0`, sobre o número do dia, que o cabeçalho do
                    // próprio card já mostra). Vários posts dividem essa
                    // área em partes iguais. `overflow-hidden`, nunca
                    // `auto`: o calendário preenche o espaço, não rola.
                    fill &&
                      dayPosts.length > 0 &&
                      "absolute inset-0 z-20 flex flex-col gap-0 space-y-0 overflow-hidden",
                  )}
                >
                  {dayPosts.map((post) =>
                    // Na visão normal o expandido é o overlay abaixo — aqui a
                    // lista mantém o chip, que fica escondido atrás dele.
                    fill && isExpanded(post) ? (
                      <ExpandedPostCard
                        key={post.id}
                        post={post}
                        variant="inline"
                        dense={dayPosts.length >= 3}
                        onSelect={onSelect}
                        onCollapse={() => collapse(post)}
                      />
                    ) : fill ? (
                      // Card recolhido dentro do ladrilho: ganha respiro por
                      // um invólucro, já que o container em si não tem gap.
                      <div key={post.id} className="shrink-0 px-2 py-1.5">
                        <PostChip post={post} onSelect={onSelect} onExpand={expand} />
                      </div>
                    ) : (
                      <PostChip
                        key={post.id}
                        post={post}
                        onSelect={onSelect}
                        onExpand={expand}
                      />
                    ),
                  )}
                </div>

                {overlay && (
                  <ExpandedPostCard
                    post={overlay}
                    variant="overlay"
                    onSelect={onSelect}
                    onCollapse={() => collapse(overlay)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
