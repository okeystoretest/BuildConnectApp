"use client";

import { Archive, CalendarDays, Eye, Paperclip, Trash2, UserMinus, UserPlus, UserCog } from "lucide-react";
import { initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { itCategoryTone } from "@/lib/it-data";
import { useArchiveCountdown } from "@/lib/use-archive-countdown";
import { DriverTripController } from "@/components/tracking/driver-trip-controller";
import type { ItTicket } from "@/types/it";

export interface DriverTicketCardProps {
  ticket: ItTicket;
  /** Id do usuário logado — decide se ele é o responsável. */
  currentUserId: string;
  /** Pode atribuir a OUTra pessoa (tickets.manage). */
  canManage: boolean;
  /** Pode assumir para si (tickets.claim). */
  canClaim: boolean;
  /**
   * Exclusão definitiva — exclusiva do Admin (tickets.manage). É a única via
   * de encerramento fora do fluxo: o antigo "Cancelar chamado" foi removido
   * por duplicar esta ação.
   */
  canDelete: boolean;
  onOpen: (ticket: ItTicket) => void;
  onClaim: (ticket: ItTicket) => void;
  onAssignOther: (ticket: ItTicket) => void;
  onUnassign: (ticket: ItTicket) => void;
  onStarted: (ticket: ItTicket) => void;
  onComplete: (ticket: ItTicket) => void;
  onDelete: (ticket: ItTicket) => void;
}

/**
 * Card do kanban de Motoristas. Sem arrastar: cada coluna expõe botões de
 * ação conforme o status e o papel do usuário.
 *
 *  - PENDENTE:     "Atribuir para mim" (claim) · "Atribuir para" (manage)
 *  - ATRIBUIDO:    "Iniciar" (liga o GPS) · "Desatribuir"
 *  - EM_ANDAMENTO: DriverTripController (GPS ativo) · "Concluir" (comprovante)
 *  - CONCLUIDO:    somente leitura
 *
 * "Iniciar" está embutido no DriverTripController, que dispara startTrip e já
 * começa a transmitir a localização. O Admin tem um botão de exclusão
 * definitiva, disponível em qualquer status.
 */
export function DriverTicketCard({
  ticket,
  currentUserId,
  canManage,
  canClaim,
  canDelete,
  onOpen,
  onClaim,
  onAssignOther,
  onUnassign,
  onStarted,
  onComplete,
  onDelete,
}: DriverTicketCardProps) {
  const isMine = ticket.assigneeId === currentUserId;
  const status = ticket.status;
  const attachmentCount = ticket.attachments?.length ?? 0;
  // Concluído: quanto falta para o card sair do quadro e ir para o histórico.
  const countdown = useArchiveCountdown(status === "CONCLUIDO" ? ticket.finishedAt : undefined);

  return (
    <article className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted">{ticket.code}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={itCategoryTone(ticket.category)} className="text-[10px]">
            {ticket.category}
          </Badge>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(ticket)}
              aria-label={`Excluir chamado ${ticket.code}`}
              className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{ticket.title}</h3>

      <div className="mt-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[9px] font-semibold text-accent">
          {initials(ticket.requesterName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{ticket.requesterName}</p>
          <p className="truncate text-[10px] text-muted">
            {ticket.requesterUnit} · {ticket.requesterSector}
          </p>
        </div>
      </div>

      {ticket.assignee && (
        <p className="mt-2 text-[11px] text-muted">
          Responsável: <span className="text-foreground">{ticket.assignee}</span>
          {isMine && <span className="text-primary"> (você)</span>}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <CalendarDays className="h-3 w-3" />
          {ticket.openedLabel} · {ticket.timeLabel}
          {attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-muted">
              <Paperclip className="h-3 w-3" />
              {attachmentCount}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onOpen(ticket)}
          className="focus-ring flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[10px] text-muted transition-colors hover:text-foreground"
        >
          <Eye className="h-3 w-3" />
          Detalhes
        </button>
      </div>

      {/* Ações por status. */}
      <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
        {status === "PENDENTE" && (
          <div className="flex flex-col gap-2">
            {canClaim && (
              <Button size="sm" onClick={() => onClaim(ticket)} className="w-full">
                <UserPlus className="h-3.5 w-3.5" /> Atribuir para mim
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAssignOther(ticket)}
                className="w-full"
              >
                <UserCog className="h-3.5 w-3.5" /> Atribuir para…
              </Button>
            )}
          </div>
        )}

        {status === "ATRIBUIDO" && (
          <div className="flex flex-col gap-2">
            {(isMine || canManage) && (
              <DriverTripController
                ticketId={ticket.id}
                started={false}
                onStarted={() => onStarted(ticket)}
              />
            )}
            {(isMine || canManage) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onUnassign(ticket)}
                className="w-full"
              >
                <UserMinus className="h-3.5 w-3.5" /> Desatribuir
              </Button>
            )}
            {!isMine && !canManage && (
              <p className="text-center text-[11px] text-muted">Atribuído a outra pessoa.</p>
            )}
          </div>
        )}

        {status === "EM_ANDAMENTO" && (
          <div className="flex flex-col gap-2">
            {(isMine || canManage) && (
              <DriverTripController ticketId={ticket.id} started onStarted={() => {}} />
            )}
            {(isMine || canManage) && (
              <Button size="sm" onClick={() => onComplete(ticket)} className="w-full">
                Concluir e enviar comprovante
              </Button>
            )}
            {!isMine && !canManage && (
              <p className="text-center text-[11px] text-muted">Corrida em andamento.</p>
            )}
          </div>
        )}

        {status === "CONCLUIDO" && (
          <>
            <p className="text-center text-[11px] text-muted">
              Concluído{ticket.distanceKm ? ` · ${ticket.distanceKm} km` : ""}
            </p>
            {/* Janela de 30 minutos: o card avisa que vai sair do quadro. */}
            {countdown && (
              <p className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[10px] text-muted">
                <Archive className="h-3 w-3 shrink-0" />
                {countdown} · depois fica no Histórico
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
