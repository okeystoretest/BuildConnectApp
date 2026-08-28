"use client";

import { Badge } from "@/components/ui/badge";
import { itCategoryTone, IT_STATUS_LABEL, IT_STATUS_TONE } from "@/lib/it-data";
import type { ItTicket } from "@/types/it";

const HEADERS = [
  "ID",
  "Status",
  "Solicitante",
  "Setor",
  "Unidade",
  "Tipo de serviço",
  "Responsável",
  "Aberto em",
  "Duração",
] as const;

/** Tabela em telas largas; cards empilhados no celular. */
export function TicketsTable({ tickets }: { tickets: readonly ItTicket[] }) {
  if (tickets.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        Nenhum chamado no período selecionado.
      </p>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {HEADERS.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="border-b border-border/60 last:border-0 hover:bg-surface-2/50"
              >
                {/* O código (RET-/MOT-) é o identificador que a operação usa;
                    o id interno não diz nada a quem lê a tabela. */}
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-accent">
                  {ticket.code}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={IT_STATUS_TONE[ticket.status]} className="whitespace-nowrap">
                    {IT_STATUS_LABEL[ticket.status]}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-foreground">
                  {ticket.requesterName}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">
                  {ticket.requesterSector}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">
                  {ticket.requesterUnit}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <Badge tone={itCategoryTone(ticket.category)} className="whitespace-nowrap">
                    {ticket.category}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">
                  {ticket.assignee ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">
                  {ticket.openedLabel}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">
                  {ticket.durationLabel ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 lg:hidden">
        {tickets.map((ticket) => (
          <article key={ticket.id} className="rounded-xl border border-border bg-surface-2/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-accent">{ticket.code}</span>
              <Badge tone={IT_STATUS_TONE[ticket.status]}>{IT_STATUS_LABEL[ticket.status]}</Badge>
            </div>

            <p className="mt-2 text-sm font-medium text-foreground">{ticket.requesterName}</p>
            <p className="text-xs text-muted">
              {ticket.requesterSector} · {ticket.requesterUnit}
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted">Tipo</dt>
                <dd>
                  <Badge tone={itCategoryTone(ticket.category)}>{ticket.category}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted">Responsável</dt>
                <dd className="text-foreground">{ticket.assignee ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted">Aberto em</dt>
                <dd className="text-foreground">{ticket.openedLabel}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted">Duração</dt>
                <dd className="text-foreground">{ticket.durationLabel ?? "—"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
