"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface TicketModalContextValue {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const TicketModalContext = createContext<TicketModalContextValue | null>(null);

export function TicketModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, openModal, closeModal }),
    [open, openModal, closeModal],
  );

  return (
    <TicketModalContext.Provider value={value}>{children}</TicketModalContext.Provider>
  );
}

export function useTicketModal(): TicketModalContextValue {
  const ctx = useContext(TicketModalContext);
  if (!ctx) throw new Error("useTicketModal precisa estar dentro de <TicketModalProvider>.");
  return ctx;
}
