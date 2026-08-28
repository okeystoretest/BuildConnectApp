"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Inbox,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  Navigation,
  Percent,
  Tag,
  UserRound,
  Users,
} from "lucide-react";
import {
  IT_ASSIGNEES,
  IT_DASHBOARD,
  IT_MONTHS,
  IT_STATUS_LABEL,
  IT_TICKETS,
} from "@/lib/it-data";
import type { ItDashboardData, ItTicket } from "@/types/it";
import { KpiTile } from "./kpi-tile";
import { DistributionPanel } from "./distribution-panel";
import { StatusDistribution } from "./status-distribution";
import { TicketsTable } from "./tickets-table";

function useClock(): string {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Renderiza vazio no servidor para não divergir na hidratação.
  if (!now) return "--:--:--";
  return now.toLocaleTimeString("pt-BR", { hour12: false });
}

const STATUS_FILTERS = ["Todos", "PENDENTE", "ATRIBUIDO", "EM_ANDAMENTO", "CONCLUIDO"] as const;

export interface DashboardExtra {
  label: string;
  value: string;
}

export interface ItDashboardProps {
  title?: string;
  data?: ItDashboardData;
  tickets?: readonly ItTicket[];
  /** Métricas adicionais exibidas após os KPIs padrão. */
  extras?: readonly DashboardExtra[];
}

export function ItDashboard({
  title = "Build.Connect · TI",
  data = IT_DASHBOARD,
  tickets = IT_TICKETS,
  extras = [],
}: ItDashboardProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [assignee, setAssignee] = useState<string>(IT_ASSIGNEES[0]);
  const [month, setMonth] = useState<string>(IT_MONTHS[0]);
  const [statusFilter, setStatusFilter] = useState<string>("Todos");
  const clock = useClock();

  // O overlay é renderizado por portal — só depois da hidratação.
  useEffect(() => setMounted(true), []);

  /**
   * Tela cheia do dashboard.
   *
   * O overlay VAI POR PORTAL para o document.body. Sem isso, `position: fixed`
   * seria resolvido contra o ancestral TRANSFORMADO: `animate-page-in` e
   * `animate-tab-in` usam `animation-fill-mode: both`, então o
   * `transform: translateY(0)` do último quadro PERMANECE no elemento e o
   * torna bloco contentor. Era esse o motivo de a "tela cheia" antiga abrir
   * presa à área de conteúdo, com as grades espremidas e a página de trás
   * rolando por baixo.
   *
   * Sobre o overlay soma-se a Fullscreen API do navegador (some também com as
   * abas e a barra de endereço). Se ela for negada, o overlay sozinho já
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

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    // ESC nativo sai do fullscreen do navegador; o overlay tem de acompanhar.
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };

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

  const rows = useMemo(
    () =>
      statusFilter === "Todos"
        ? tickets
        : tickets.filter((ticket) => ticket.status === statusFilter),
    [statusFilter, tickets],
  );

  /**
   * Corpo do dashboard. O MESMO bloco serve para a versão embutida na página e
   * para a tela cheia: nenhuma grade muda de definição entre os dois estados,
   * então a responsividade dos KPIs, das distribuições e da tabela é a mesma
   * nos dois — só o espaço disponível muda.
   */
  function dashboardBlock(inFullscreen: boolean) {
    return (
      <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-bold tracking-tight text-foreground">{title}</p>
          <p className="mt-0.5 text-[11px] text-muted">Última atualização: 23/07/2026, 16:07</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <UserRound className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Responsável:</span>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              aria-label="Filtrar por responsável"
              className="focus-ring h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground"
            >
              {IT_ASSIGNEES.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-muted">
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mês:</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Filtrar por mês"
              className="focus-ring h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground"
            >
              {IT_MONTHS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <div className="text-right">
            <p className="font-mono text-sm font-bold text-foreground">{clock}</p>
            <p className="text-[10px] text-muted">Horário atual</p>
          </div>

          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-pressed={inFullscreen}
            className="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs text-foreground transition-colors hover:bg-surface-2"
          >
            {inFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            {inFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile icon={<Inbox className="h-4 w-4" />} value={data.total} label="Total no período" />
        <KpiTile
          icon={<Clock className="h-4 w-4" />}
          value={data.byStatus.PENDENTE}
          label={IT_STATUS_LABEL.PENDENTE}
          hint={`${Math.round((data.byStatus.PENDENTE / data.total) * 100)}% do total`}
          tone="warning"
        />
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          value={data.byStatus.ATRIBUIDO}
          label={IT_STATUS_LABEL.ATRIBUIDO}
          hint={`${Math.round((data.byStatus.ATRIBUIDO / data.total) * 100)}% do total`}
          tone="info"
        />
        <KpiTile
          icon={<Loader2 className="h-4 w-4" />}
          value={data.byStatus.EM_ANDAMENTO}
          label={IT_STATUS_LABEL.EM_ANDAMENTO}
          hint={`${Math.round((data.byStatus.EM_ANDAMENTO / data.total) * 100)}% do total`}
          tone="accent"
        />
        <KpiTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          value={data.byStatus.CONCLUIDO}
          label={IT_STATUS_LABEL.CONCLUIDO}
          hint={`${Math.round((data.byStatus.CONCLUIDO / data.total) * 100)}% do total`}
          tone="primary"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile icon={<Clock className="h-4 w-4" />} value={data.avgResolution} label="Tempo médio de resolução" />
        <KpiTile icon={<Percent className="h-4 w-4" />} value={`${data.completionRate}%`} label="Taxa de conclusão" tone="primary" />
        <KpiTile icon={<LayoutGrid className="h-4 w-4" />} value={data.topUnit} label="Unidade que mais solicita" />
        <KpiTile icon={<UserRound className="h-4 w-4" />} value={data.topResolver} label="Maior resolvedor" />
      </div>

      {extras.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {extras.map((extra) => (
            <KpiTile
              key={extra.label}
              icon={<Navigation className="h-4 w-4" />}
              value={extra.value}
              label={extra.label}
              tone="accent"
            />
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <DistributionPanel title="Por categoria" icon={<Tag className="h-3 w-3" />} entries={data.byCategory} />
        <DistributionPanel title="Por unidade" icon={<LayoutGrid className="h-3 w-3" />} entries={data.byUnit} />
        <DistributionPanel
          title="Categoria por unidade"
          icon={<LayoutGrid className="h-3 w-3" />}
          entries={data.categoryByUnit}
        />
        <StatusDistribution byStatus={data.byStatus} total={data.total} />
      </div>

      <section className="mt-3 rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
            <Inbox className="h-3 w-3" />
            Chamados do período
          </h3>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              Status:
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filtrar tabela por status"
                className="focus-ring h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground"
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {option === "Todos"
                      ? "Todos"
                      : IT_STATUS_LABEL[option as keyof typeof IT_STATUS_LABEL]}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[11px] text-muted">{rows.length} registros</span>
          </div>
        </div>

        <TicketsTable tickets={rows} />
      </section>
      </>
    );
  }

  return (
    <>
      {!fullscreen && dashboardBlock(false)}

      {fullscreen &&
        mounted &&
        createPortal(
          <div
            ref={overlayRef}
            // A rolagem é do overlay: o dashboard é denso e a tela cheia não
            // pode cortar a tabela do rodapé.
            className="scrollbar-slim fixed inset-0 z-50 overflow-y-auto bg-background p-4 sm:p-6"
          >
            {dashboardBlock(true)}
          </div>,
          document.body,
        )}
    </>
  );
}
