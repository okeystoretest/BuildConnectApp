"use client";

import { Input } from "@/components/ui/input";

export interface AddressValue {
  street: string;
  number: string;
  district: string;
}

export interface AddressFieldsProps {
  label: string;
  idPrefix: string;
  value: AddressValue;
  onChange: (patch: Partial<AddressValue>) => void;
  error?: string;
}

/** Logradouro + número + bairro. Usado no destino e na partida manual. */
export function AddressFields({
  label,
  idPrefix,
  value,
  onChange,
  error,
}: AddressFieldsProps) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-foreground">{label}</p>

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <Input
            id={`${idPrefix}-street`}
            aria-label={`${label} — rua ou logradouro`}
            placeholder="Rua / Logradouro"
            value={value.street}
            onChange={(e) => onChange({ street: e.target.value })}
            aria-invalid={Boolean(error)}
            className="h-11 rounded-xl"
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>

        <Input
          id={`${idPrefix}-number`}
          aria-label={`${label} — número`}
          placeholder="Número"
          value={value.number}
          onChange={(e) => onChange({ number: e.target.value })}
          className="h-11 rounded-xl"
        />
      </div>

      <Input
        id={`${idPrefix}-district`}
        aria-label={`${label} — bairro`}
        placeholder="Bairro"
        value={value.district}
        onChange={(e) => onChange({ district: e.target.value })}
        className="mt-3 h-11 rounded-xl"
      />
    </div>
  );
}
