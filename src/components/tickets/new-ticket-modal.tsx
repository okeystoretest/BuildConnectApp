"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ItTicketFields } from "./it-ticket-fields";
import { DriverTicketFields } from "./driver-ticket-fields";
import { OTHER_OPTION, UNITS } from "@/lib/units";
import { createDriverTicket, createItTicket } from "@/lib/tickets/actions";
import {
  DRIVER_OPTIONS,
  SERVICE_TYPES,
  type DriverTicketForm,
  type ItTicketForm,
  type TicketDestination,
} from "@/types/ticket-form";

const DESTINATIONS = [
  { value: "TI" as const, label: "TI" },
  { value: "MOTORISTAS" as const, label: "Motoristas" },
];

const EMPTY_IT: ItTicketForm = { category: null, description: "", images: [] };

const EMPTY_DRIVER: DriverTicketForm = {
  driver: DRIVER_OPTIONS[0] ?? "",
  departurePoint: UNITS[0] ?? "",
  departureStreet: "",
  departureNumber: "",
  departureDistrict: "",
  serviceType: SERVICE_TYPES[0],
  street: "",
  number: "",
  district: "",
  description: "",
  contact: "",
};

export interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewTicketModal({ open, onClose }: NewTicketModalProps) {
  const [destination, setDestination] = useState<TicketDestination>("TI");
  const [itForm, setItForm] = useState<ItTicketForm>(EMPTY_IT);
  const [driverForm, setDriverForm] = useState<DriverTicketForm>(EMPTY_DRIVER);
  const [itErrors, setItErrors] = useState<Partial<Record<keyof ItTicketForm, string>>>({});
  const [driverErrors, setDriverErrors] = useState<
    Partial<Record<keyof DriverTicketForm, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function reset() {
    setDestination("TI");
    setItForm(EMPTY_IT);
    setDriverForm(EMPTY_DRIVER);
    setItErrors({});
    setDriverErrors({});
    setSubmitError(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function validate(): boolean {
    if (destination === "TI") {
      const next: Partial<Record<keyof ItTicketForm, string>> = {};
      if (!itForm.category) next.category = "Escolha uma categoria.";
      if (!itForm.description.trim()) next.description = "Descreva o que está acontecendo.";
      setItErrors(next);
      return Object.keys(next).length === 0;
    }

    const next: Partial<Record<keyof DriverTicketForm, string>> = {};
    if (driverForm.departurePoint === OTHER_OPTION && !driverForm.departureStreet.trim()) {
      next.departureStreet = "Informe o logradouro de partida.";
    }
    if (!driverForm.street.trim()) next.street = "Informe o logradouro de destino.";
    if (!driverForm.description.trim()) next.description = "Descreva a atividade solicitada.";
    setDriverErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);

    // TI: Server Action real com tratamento de imagens (sharp).
    if (destination === "TI") {
      const itFd = new FormData();
      itFd.set("category", itForm.category ?? "");
      itFd.set("description", itForm.description);
      for (const image of itForm.images) itFd.append("images", image);

      const itResult = await createItTicket(itFd);
      setSubmitting(false);

      if (!itResult.ok) {
        if (itResult.fieldErrors) {
          setItErrors(itResult.fieldErrors as typeof itErrors);
        }
        setSubmitError(itResult.error ?? "Não foi possível abrir o chamado.");
        return;
      }

      reset();
      onClose();
      return;
    }

    // Motoristas: Server Action real com tratamento de imagens.
    const fd = new FormData();
    fd.set("driver", driverForm.driver);
    fd.set("departurePoint", driverForm.departurePoint);
    fd.set("departureStreet", driverForm.departureStreet);
    fd.set("departureNumber", driverForm.departureNumber);
    fd.set("departureDistrict", driverForm.departureDistrict);
    fd.set("serviceType", driverForm.serviceType);
    fd.set("street", driverForm.street);
    fd.set("number", driverForm.number);
    fd.set("district", driverForm.district);
    fd.set("description", driverForm.description);
    fd.set("contact", driverForm.contact);

    const result = await createDriverTicket(fd);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        setDriverErrors(result.fieldErrors as typeof driverErrors);
      }
      setSubmitError(result.error ?? "Não foi possível abrir o chamado.");
      return;
    }

    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-xl">
      <div className="scrollbar-slim max-h-[80vh] overflow-y-auto p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Abrir Chamado</h2>
            <p className="mt-0.5 text-xs text-muted">
              Solicitação encaminhada ao setor de TI ou Motoristas.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="mb-5">
          <p className="mb-1.5 text-xs font-medium text-foreground">Destino do chamado</p>
          <Segmented
            options={DESTINATIONS}
            value={destination}
            onChange={setDestination}
            ariaLabel="Destino do chamado"
          />
        </div>

        {destination === "TI" ? (
          <ItTicketFields
            form={itForm}
            errors={itErrors}
            onChange={(patch) => {
              setItForm((prev) => ({ ...prev, ...patch }));
              setItErrors({});
            }}
          />
        ) : (
          <DriverTicketFields
            form={driverForm}
            errors={driverErrors}
            onChange={(patch) => {
              setDriverForm((prev) => ({ ...prev, ...patch }));
              setDriverErrors({});
            }}
          />
        )}

        {submitError && (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {submitError}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={submitting} className="h-11">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="h-11">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Enviando" : "Enviar chamado"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
