"use client";

import { useEffect, useState } from "react";
import {
  CircleUser,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  LifeBuoy,
  LogIn,
  LogOut,
  PlayCircle,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateLabelBR, isoDateBR, timeLabelBR } from "@/lib/brasilia";
import { fetchActivityPage } from "@/lib/activity-timeline-actions";
import type { ActivityCursor, ActivityItem, ActivityKind } from "@/lib/activity-timeline";

/** Ícone por tipo de evento. */
const ICON: Record<ActivityKind, LucideIcon> = {
  CADASTRO: UserPlus,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  VIDEO_ASSISTIDO: PlayCircle,
  RESPOSTA_COMPREENSAO: FileQuestion,
  AVALIACAO_VIDEO: Star,
  AVALIACAO_DESIGNADA: ClipboardList,
  AVALIACAO_ABERTA: CircleUser,
  AVALIACAO_RESPONDIDA: ClipboardCheck,
  CHAMADO_ABERTO: LifeBuoy,
};

/** Data em que a plataforma passou a registrar entrada e saída. */
const SESSION_LOG_SINCE = "25/09/2026";

interface Day {
  key: string;
  label: string;
  items: ActivityItem[];
}

/**
 * Agrupa por dia de calendário em Brasília, preservando a ordem recebida.
 *
 * O agrupamento é feito aqui e não no servidor porque depende só da data que
 * já veio: mandar o rótulo do dia repetido em cada evento seria enviar a mesma
 * string trinta vezes.
 */
function byDay(events: readonly ActivityItem[]): Day[] {
  const days: Day[] = [];
  for (const item of events) {
    const key = isoDateBR(item.occurredAt);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, label: dateLabelBR(item.occurredAt), items: [item] });
  }
  return days;
}

/**
 * Linha do tempo do colaborador.
 *
 * Paginada por cursor, com botão em vez de rolagem infinita: o DHO costuma
 * procurar um evento específico, e rolagem infinita tira dele o controle de
 * onde parou.
 */
export function ActivityTimeline({
  userId,
  initial,
}: {
  userId: string;
  initial: { events: ActivityItem[]; nextCursor: ActivityCursor | null };
}) {
  const [events, setEvents] = useState<ActivityItem[]>(initial.events);
  const [cursor, setCursor] = useState<ActivityCursor | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Trocar de colaborador reinicia a lista. Sem isto, a atividade da pessoa
   * anterior continuaria na tela sob o nome da nova — o componente não é
   * remontado, porque a posição dele na árvore não muda.
   */
  useEffect(() => {
    setEvents(initial.events);
    setCursor(initial.nextCursor);
    setError(null);
  }, [initial]);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    const res = await fetchActivityPage({ userId, cursor });
    if (res.ok && res.events) {
      const page = res.events;
      setEvents((current) => [...current, ...page]);
      setCursor(res.nextCursor ?? null);
    } else {
      setError(res.error ?? "Não foi possível carregar mais eventos.");
    }
    setLoading(false);
  }

  const days = byDay(events);
  // O cadastro é o evento mais antigo que existe: tê-lo à vista significa que
  // a linha do tempo chegou ao início.
  const reachedStart = !cursor && events.some((e) => e.kind === "CADASTRO");

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
        <ClipboardList className="h-3 w-3" />
        Atividade
      </h3>

      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nenhuma atividade registrada.</p>
      ) : (
        <div className="scrollbar-slim max-h-[28rem] space-y-5 overflow-y-auto pr-1">
          {days.map((day) => (
            <div key={day.key}>
              <p className="mb-2 text-[11px] font-semibold text-muted">{day.label}</p>
              <ul className="space-y-3">
                {day.items.map((item) => {
                  const Icon = ICON[item.kind];
                  return (
                    <li key={item.id} className="flex gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground">{item.title}</span>
                        {item.detail && (
                          <span className="block break-words text-xs text-muted">
                            {item.detail}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted">
                        {timeLabelBR(item.occurredAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {cursor && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loading}>
            {loading ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      )}

      {/* Sem este aviso, um cadastro antigo sem nenhum LOGIN lê-se como
          "nunca acessou a plataforma". */}
      {reachedStart && (
        <p className="mt-4 text-[11px] text-muted">
          Registros de entrada e saída existem a partir de {SESSION_LOG_SINCE}.
        </p>
      )}
    </section>
  );
}
