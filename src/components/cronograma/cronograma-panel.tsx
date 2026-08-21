"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  Plus,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BRAND,
  BRAND_ORDER,
  FORMAT_LABEL,
  FUNNEL,
  FUNNEL_ORDER,
  MONTH_LABEL,
  STATUS_LABEL,
  resolveBrand,
} from "@/lib/funnel";
import { FunnelAreaChart } from "./funnel-area-chart";
import { FunnelDonut } from "./funnel-donut";
import { ContentCalendar, type CalendarView } from "./content-calendar";
import { ProductionBacklog } from "./production-backlog";
import { PostModal } from "./post-modal";
import { PostDetailsModal } from "./post-details-modal";
import { VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/cronograma-visibility";
import type { ContentPostItem, CronogramaData, FunnelStage } from "@/types/cronograma";

export interface CronogramaPanelProps {
  slug: string;
  data: CronogramaData;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lista de dias (ISO) da grade do mês, sempre de segunda a domingo. */
function buildDays(year: number, month: number): string[] {
  const first = Date.UTC(year, month - 1, 1);
  const last = Date.UTC(year, month, 0);
  const startOffset = (new Date(first).getUTCDay() + 6) % 7;
  const endOffset = 6 - ((new Date(last).getUTCDay() + 6) % 7);

  const days: string[] = [];
  for (let t = first - startOffset * DAY_MS; t <= last + endOffset * DAY_MS; t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

function todayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

/**
 * Ferramenta Cronograma.
 *
 * Ordem da tela: cabeçalho → filtros e legenda → calendário em largura total
 * → gráficos → fila de produção. O calendário é o centro do trabalho diário;
 * os gráficos são leitura de apoio e ficam abaixo dele.
 *
 * Navegar de mês recarrega a página (dados vêm do servidor); semana e dia são
 * recortes do que já está carregado, sem ida ao servidor.
 */
export function CronogramaPanel({ slug, data }: CronogramaPanelProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [view, setView] = useState<CalendarView>("month");
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState<readonly FunnelStage[]>(FUNNEL_ORDER);
  const [cursor, setCursor] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContentPostItem | null>(null);
  const [draftDate, setDraftDate] = useState<string | undefined>(undefined);
  /**
   * Detalhes guardam apenas o ID: o objeto é relido de `data.posts` a cada
   * render, então o modal acompanha o `router.refresh()` em vez de mostrar
   * um retrato desatualizado do post.
   */
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // O overlay é renderizado por portal — só depois da hidratação.
  useEffect(() => setMounted(true), []);

  /**
   * Tela cheia de verdade.
   *
   * Duas camadas: o overlay em portal garante que o calendário ocupe a janela
   * inteira (imune a qualquer ancestral com `transform`, que quebraria
   * `position: fixed`), e a Fullscreen API do navegador some também com a
   * barra de endereço e as abas. Se a API for negada, o overlay sozinho já
   * entrega a visualização ampliada.
   */
  useEffect(() => {
    if (!fullscreen) return;

    const node = overlayRef.current;
    if (node && !document.fullscreenElement) {
      void node.requestFullscreen?.().catch(() => {
        /* sem permissão ou sem suporte: o overlay basta */
      });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    // ESC nativo sai do fullscreen do navegador; o overlay tem de acompanhar.
    function onFullscreenChange() {
      if (!document.fullscreenElement) setFullscreen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.body.style.overflow = previous;
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, [fullscreen]);

  const detailsPost = useMemo(
    () => data.posts.find((post) => post.id === detailsId) ?? null,
    [data.posts, detailsId],
  );

  const allDays = useMemo(() => buildDays(data.year, data.month), [data.year, data.month]);
  const today = todayIso();

  const filteredPosts = useMemo(
    () => data.posts.filter((post) => visible.includes(post.funnel)),
    [data.posts, visible],
  );

  // Recorte visível conforme a visão escolhida.
  const days = useMemo(() => {
    if (view === "month") return allDays;
    if (view === "week") {
      const weekStart = Math.min(Math.floor(cursor / 7) * 7, Math.max(allDays.length - 7, 0));
      return allDays.slice(weekStart, weekStart + 7);
    }
    return allDays.slice(cursor, cursor + 1);
  }, [view, allDays, cursor]);

  function goToMonth(delta: number) {
    const next = new Date(Date.UTC(data.year, data.month - 1 + delta, 1));
    const params = new URLSearchParams({
      aba: "cronograma",
      ano: String(next.getUTCFullYear()),
      mes: String(next.getUTCMonth() + 1),
    });
    setCursor(0);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  /** Setas: mês inteiro na visão mensal; semana ou dia nas demais. */
  function navigate(delta: number) {
    if (view === "month") return goToMonth(delta);

    const step = view === "week" ? 7 : 1;
    const next = cursor + delta * step;
    if (next < 0 || next >= allDays.length) return goToMonth(delta);
    setCursor(next);
  }

  function toggleStage(stage: FunnelStage) {
    setVisible((prev) =>
      prev.includes(stage)
        ? prev.filter((s) => s !== stage)
        : FUNNEL_ORDER.filter((s) => prev.includes(s) || s === stage),
    );
  }

  function openCreate(date?: string) {
    setEditing(null);
    setDraftDate(date ?? days[0] ?? today);
    setModalOpen(true);
  }

  /** Clique no card: detalhes primeiro. O formulário só abre em "Editar". */
  function openDetails(post: ContentPostItem) {
    setDetailsId(post.id);
  }

  function openEdit(post: ContentPostItem) {
    setDetailsId(null);
    setEditing(post);
    setDraftDate(undefined);
    setModalOpen(true);
  }

  /** Exportação local em CSV — sem rota extra e sem carregar o servidor. */
  function exportCsv() {
    const header = ["Título", "Data", "Hora", "Funil", "Formato", "Marca", "Status", "Responsável"];
    const rows = filteredPosts.map((post) => [
      post.title,
      post.date,
      post.time,
      post.funnel,
      FORMAT_LABEL[post.format],
      (() => {
        const key = resolveBrand(post.brand);
        return key ? BRAND[key].label : "";
      })(),
      STATUS_LABEL[post.status],
      post.owner?.name ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cronograma-${data.scopeSlug}-${data.year}-${String(data.month).padStart(2, "0")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const rangeLabel =
    view === "month"
      ? `${MONTH_LABEL[data.month - 1]} ${data.year}`
      : view === "week"
        ? `${days[0]?.slice(8, 10)}/${days[0]?.slice(5, 7)} – ${days[days.length - 1]?.slice(8, 10)}/${days[days.length - 1]?.slice(5, 7)}`
        : `${days[0]?.slice(8, 10)}/${days[0]?.slice(5, 7)}/${data.year}`;

  /**
   * Barra de controles + grade. O mesmo bloco serve para a versão embutida na
   * página e para a tela cheia — o que muda é só o `fill`, que faz a grade
   * esticar para ocupar a altura da janela.
   */
  function calendarBlock(inFullscreen: boolean) {
    return (
      <div className={cn(inFullscreen && "flex min-h-0 flex-1 flex-col")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Período anterior"
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-foreground">{rangeLabel}</span>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label="Próximo período"
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
              {(
                [
                  ["month", "Mês"],
                  ["week", "Semana"],
                  ["day", "Dia"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setView(id);
                    if (id !== "month") {
                      const index = allDays.indexOf(today);
                      setCursor(index >= 0 ? index : 0);
                    }
                  }}
                  className={cn(
                    "focus-ring rounded-md px-3 py-1.5 text-xs transition-colors",
                    view === id
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tela cheia: o calendário toma a janela inteira. */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFullscreen((v) => !v)}
              aria-pressed={inFullscreen}
            >
              {inFullscreen ? (
                <>
                  <Minimize2 className="h-4 w-4" />
                  Sair da tela cheia
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" />
                  Expandir Calendário
                </>
              )}
            </Button>
          </div>
        </div>

        <ContentCalendar
          days={days}
          month={data.month}
          view={view}
          posts={filteredPosts}
          today={today}
          fill={inFullscreen}
          onCreate={openCreate}
          onSelect={openDetails}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho da ferramenta */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted">
            Conteúdo Agendado · {MONTH_LABEL[data.month - 1]} {data.year}
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {data.activePosts} {data.activePosts === 1 ? "Post Ativo" : "Posts Ativos"}
          </h2>
          {data.inherited && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted">
              <Share2 className="h-3.5 w-3.5" />
              Base compartilhada com {data.scopeLabel}
            </p>
          )}
          {/* Deixa explícito o alcance do que for criado nesta aba. */}
          <p className="mt-1 text-[11px] text-muted" title={VISIBILITY_HINT[data.authoring]}>
            Nesta aba, o que você criar fica como{" "}
            <span className="font-semibold text-foreground">
              {VISIBILITY_LABEL[data.authoring]}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          {/* Criar é liberado para todos os níveis de acesso. */}
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            Novo Conteúdo
          </Button>
        </div>
      </div>

      {/* Filtros e legenda — acima do calendário, em faixa horizontal */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Filtros estratégicos
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FUNNEL_ORDER.map((stage) => {
                const active = visible.includes(stage);
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => toggleStage(stage)}
                    aria-pressed={active}
                    className={cn(
                      "focus-ring inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? FUNNEL[stage].badge
                        : "border-border bg-surface-2 text-muted hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn("h-2 w-2 rounded-full", !active && "opacity-40")}
                      style={{ backgroundColor: FUNNEL[stage].color }}
                    />
                    {FUNNEL[stage].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-[280px] flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Legenda do funil
            </p>
            <ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              {FUNNEL_ORDER.map((stage) => (
                <li key={stage} className="flex gap-2">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: FUNNEL[stage].color }}
                  />
                  <span>
                    <span className="block text-xs font-semibold text-foreground">
                      {FUNNEL[stage].title}
                    </span>
                    <span className="block text-[11px] leading-snug text-muted">
                      {FUNNEL[stage].description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Marcas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BRAND_ORDER.map((brand) => (
                <span
                  key={brand}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: BRAND[brand].background,
                    borderColor: BRAND[brand].border,
                    color: BRAND[brand].foreground,
                  }}
                >
                  {BRAND[brand].label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Calendário: inline ou em tela cheia (portal + Fullscreen API) */}
      {!fullscreen && (
        <section className="rounded-xl border border-border bg-surface p-4">
          {calendarBlock(false)}
        </section>
      )}

      {fullscreen &&
        mounted &&
        createPortal(
          <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex flex-col bg-background p-4 sm:p-6"
          >
            {calendarBlock(true)}
          </div>,
          document.body,
        )}

      {/* Gráficos — leitura de apoio, abaixo do calendário */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-foreground">Volume por Etapa do Funil</h3>
          <p className="mt-0.5 text-xs text-muted">
            Atração (TOFU) → Consideração (MOFU) → Conversão (BOFU)
          </p>

          <div className="mt-4 flex flex-wrap gap-4">
            {FUNNEL_ORDER.map((stage) => (
              <span key={stage} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="h-2.5 w-6 rounded-full"
                  style={{ backgroundColor: FUNNEL[stage].color }}
                />
                {FUNNEL[stage].short}
              </span>
            ))}
          </div>

          <div className="mt-2">
            <FunnelAreaChart points={data.volume} visible={visible} />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-foreground">Equilíbrio de Conteúdo</h3>
          <p className="mt-0.5 text-xs text-muted">Distribuição atual do ciclo</p>

          <div className="mt-4 flex justify-center">
            <FunnelDonut balance={data.balance} />
          </div>

          <ul className="mt-4 space-y-2">
            {data.balance.map((slice) => (
              <li key={slice.stage} className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-muted">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: FUNNEL[slice.stage].color }}
                  />
                  {FUNNEL[slice.stage].label}
                </span>
                <span className="font-semibold text-foreground">{slice.percent}%</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Fila de produção */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-foreground">Backlog de Produção</h3>
        <p className="mb-4 mt-0.5 text-xs text-muted">
          Posts do mês que ainda não foram publicados.
        </p>
        <ProductionBacklog slug={slug} items={data.backlog} onSelect={openDetails} />
      </section>

      <PostDetailsModal
        slug={slug}
        open={detailsPost !== null}
        post={detailsPost}
        onClose={() => setDetailsId(null)}
        onEdit={openEdit}
      />

      <PostModal
        slug={slug}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        post={editing}
        defaultDate={draftDate}
        people={data.people}
      />
    </div>
  );
}
