"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OTHER_OPTION, formatAddress, getUnitAddress } from "@/lib/units";
import { DEPARTURE_POINTS, DRIVER_OPTIONS, SERVICE_TYPES } from "@/types/ticket-form";
import type { DriverTicketForm } from "@/types/ticket-form";
import { AddressFields } from "./address-fields";

export interface DriverTicketFieldsProps {
  form: DriverTicketForm;
  onChange: (patch: Partial<DriverTicketForm>) => void;
  errors: Partial<Record<keyof DriverTicketForm, string>>;
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function DriverTicketFields({ form, onChange, errors }: DriverTicketFieldsProps) {
  const customDeparture = form.departurePoint === OTHER_OPTION;
  const linkedAddress = customDeparture ? null : getUnitAddress(form.departurePoint);
  // Unidade sem endereço cadastrado também exige preenchimento manual.
  const needsManualAddress = customDeparture || (Boolean(form.departurePoint) && !linkedAddress);

  return (
    <div className="space-y-5">
      <Field label="Motorista" htmlFor="driver">
        <Select
          id="driver"
          options={DRIVER_OPTIONS}
          value={form.driver}
          onChange={(e) => onChange({ driver: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ponto de partida" htmlFor="departure">
          <Select
            id="departure"
            options={DEPARTURE_POINTS}
            value={form.departurePoint}
            onChange={(e) => {
              const next = e.target.value;
              // Ao sair de "Outro", limpa o endereço manual.
              onChange(
                next === OTHER_OPTION
                  ? { departurePoint: next }
                  : {
                      departurePoint: next,
                      departureStreet: "",
                      departureNumber: "",
                      departureDistrict: "",
                    },
              );
            }}
          />
        </Field>

        <Field label="Tipo de serviço" htmlFor="service-type">
          <Select
            id="service-type"
            options={SERVICE_TYPES}
            value={form.serviceType}
            onChange={(e) => onChange({ serviceType: e.target.value })}
          />
        </Field>
      </div>

      {linkedAddress && (
        <div className="animate-fade-in rounded-xl border border-border bg-surface-2/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted">Endereço de partida</p>
          <p className="mt-0.5 text-sm text-foreground">{formatAddress(linkedAddress)}</p>
        </div>
      )}

      {needsManualAddress && (
        <div className="animate-fade-in">
          <AddressFields
            label={
              customDeparture
                ? "Endereço de partida"
                : `Endereço de partida — ${form.departurePoint}`
            }
            idPrefix="departure"
            value={{
              street: form.departureStreet,
              number: form.departureNumber,
              district: form.departureDistrict,
            }}
            onChange={(patch) =>
              onChange({
                ...(patch.street !== undefined && { departureStreet: patch.street }),
                ...(patch.number !== undefined && { departureNumber: patch.number }),
                ...(patch.district !== undefined && { departureDistrict: patch.district }),
              })
            }
            error={errors.departureStreet}
          />
        </div>
      )}

      <AddressFields
        label="Endereço de destino"
        idPrefix="destination"
        value={{ street: form.street, number: form.number, district: form.district }}
        onChange={(patch) =>
          onChange({
            ...(patch.street !== undefined && { street: patch.street }),
            ...(patch.number !== undefined && { number: patch.number }),
            ...(patch.district !== undefined && { district: patch.district }),
          })
        }
        error={errors.street}
      />

      <Field label="Descrição da atividade" htmlFor="driver-description" error={errors.description}>
        <Textarea
          id="driver-description"
          rows={4}
          value={form.description}
          placeholder="Detalhe o que deve ser feito nesta solicitação..."
          onChange={(e) => onChange({ description: e.target.value })}
          aria-invalid={Boolean(errors.description)}
        />
      </Field>

      <div>
        <label htmlFor="contact" className="mb-1.5 block text-xs font-medium text-foreground">
          Contato no destino <span className="text-muted">(opcional)</span>
        </label>
        <Input
          id="contact"
          placeholder="Nome de quem recebe/entrega"
          value={form.contact}
          onChange={(e) => onChange({ contact: e.target.value })}
          className="h-11 rounded-xl"
        />
      </div>
    </div>
  );
}
