"use client";

import { NewTicketModal } from "./new-ticket-modal";
import { useTicketModal } from "@/providers/ticket-modal-provider";

/** Instância única do modal, montada no shell e acionada de qualquer tela. */
export function TicketModalHost() {
  const { open, closeModal } = useTicketModal();
  return <NewTicketModal open={open} onClose={closeModal} />;
}
