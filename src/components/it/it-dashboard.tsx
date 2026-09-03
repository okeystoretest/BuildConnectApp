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
import { IT_STATUS_LABEL } from "@/lib/it-data";
import { MONTH_LABEL } from "@/lib/funnel";
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

/**
 * Quando estes dados chegaram do servidor.
 *
 * A página é dinâmica e o dashboard não faz polling: o dado é do instante em
 * que a tela montou. Fica em estado (e não calculado no render) porque o
 * carimbo depende do relógio — computá-lo no render faria o HTML do servidor
 * divergir do cliente na hidratação. Antes havia aqui uma data fixa escrita no
 * código, que anunciava "23/07/2026" para sempre.
 */
function useLoadedAt(): string {
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  useEffect(() => setLoadedAt(new Date()), []);
  if (!loadedAt) return "—";
  return loadedAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const STATUS_FILTERS = ["Todos", "PENDENTE", "ATRIBUIDO", "EM_ANDAMENTO", "CONCLUIDO"] as const;

/** Opção "sem recorte" de cada filtro da tabela. */
const ALL_ASSIGNEES = "Todos os responsáveis";
const ALL_MONTHS = "Todos os meses";

/** "2026-07" -> "Julho 2026". */
function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const name = MONTH_LABEL[Number(month) - 1];
  return name && year ? `${name} ${year}` : key;
}

export interface DashboardExtra {
  label: string;
  value: string;
}

export interface ItDashboardProps {
  title?: string;
  /** Agregações do setor, vindas do banco. */
  data: ItDashboardData;
  /** Chamados do quadro, já recortados pela visibilidade de quem olha. */
  tickets: readonly ItTicket[];
  /** Métricas adicionais exibidas após os KPIs padrão. */
  extras?: readonly DashboardExtra[];
}

export function ItDashboard({
  title = "Build.Connect · TI",
  data,
  tickets,
  extras = [],
}: ItDashboardProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [assignee, setAssignee] = useState<string>(ALL_ASSIGNEES);
  const [month, setMonth] = useState<string>(ALL_MONTHS);
  const [statusFilter, setStatusFilter] = useState<string>("Todos");
  const clock = useClock();
  const loadedAt = useLoadedAt();

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

  /**
   * Opções dos filtros, derivadas dos chamados que estão na tela.
   *
   * Antes eram três nomes e três meses escritos no código — e, pior, nenhum
   * dos dois filtrava coisa alguma: o usuário escolhia e a tabela não mudava.
   * Saindo dos dados, a lista só oferece recorte que existe.
   */
  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const ticket of tickets) if (ticket.assignee) names.add(ticket.assignee);
    return [ALL_ASSIGNEES, ...[...names].sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [tickets]);

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const ticket of tickets) if (ticket.openedAt) keys.add(ticket.openedAt.slice(0, 7));
    // Mais recente primeiro: "YYYY-MM" ordena por texto igual a por data.
    const sorted = [...keys].sort().reverse();
    return [
      { value: ALL_MONTHS, label: ALL_MONTHS },
      ...sorted.map((key) => ({ value: key, label: monthLabel(key) })),
    ];
  }, [tickets]);

  // Um recorte que sumiu da lista (o último chamado daquele responsável foi
  // concluído e arquivado, por exemplo) deixaria a tabela presa em zero
  // registro, sem opção visível para desfazer. Volta para "todos".
  useEffect(() => {
    if (!assigneeOptions.includes(assignee)) setAssignee(ALL_ASSIGNEES);
  }, [assigneeOptions, assignee]);

  useEffect(() => {
    if (!monthOptions.some((option) => option.value === month)) setMonth(ALL_MONTHS);
  }, [monthOptions, month]);

  const rows = useMemo(
    () =>
      tickets.filter((ticket) => {
        if (statusFilter !== "Todos" && ticket.status !== statusFilter) return false;
        if (assignee !== ALL_ASSIGNEES && ticket.assignee !== assignee) return false;
        if (month !== ALL_MONTHS && ticket.openedAt.slice(0, 7) !== month) return false;
        return true;
      }),
    [tickets, statusFilter, assignee, month],
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
          <p className="mt-0.5 text-[11px] text-muted">Última atualização: {loadedAt}</p>
        </div>

        {/* Os filtros de responsável e de mês moraram aqui e recortam APENAS a
            tabela do rodapé — nunca os KPIs, que são a agregação do setor
            calculada no servidor. Ficam junto da tabela, onde o efeito é
            visível: no cabeçalho pareciam governar o dashboard inteiro. */}
        <div className="flex flex-wrap items-center gap-2">
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

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              <UserRound className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Responsável:</span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                aria-label="Filtrar tabela por responsável"
                className="focus-ring h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground"
              >
                {assigneeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-muted">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mês:</span>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Filtrar tabela por mês"
                className="focus-ring h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

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
