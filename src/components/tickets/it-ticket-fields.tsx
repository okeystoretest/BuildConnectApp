"use client";

import { ChipGroup } from "@/components/ui/chip-group";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/ui/image-uploader";
import { IT_CATEGORIES, MAX_TICKET_IMAGES } from "@/types/ticket-form";
import type { ItTicketForm } from "@/types/ticket-form";

export interface ItTicketFieldsProps {
  form: ItTicketForm;
  onChange: (patch: Partial<ItTicketForm>) => void;
  errors: Partial<Record<keyof ItTicketForm, string>>;
}

export function ItTicketFields({ form, onChange, errors }: ItTicketFieldsProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">Categoria</p>
        <ChipGroup
          options={IT_CATEGORIES}
          value={form.category}
          onChange={(value) => onChange({ category: value as ItTicketForm["category"] })}
          ariaLabel="Categoria do chamado"
        />
        {errors.category && <p className="mt-1.5 text-xs text-danger">{errors.category}</p>}
      </div>

      <div>
        <label htmlFor="it-description" className="mb-1.5 block text-xs font-medium text-foreground">
          Descrição
        </label>
        <Textarea
          id="it-description"
          rows={5}
          value={form.description}
          placeholder="Detalhe o que está acontecendo..."
          onChange={(e) => onChange({ description: e.target.value })}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "it-description-error" : undefined}
        />
        {errors.description && (
          <p id="it-description-error" className="mt-1.5 text-xs text-danger">
            {errors.description}
          </p>
        )}
      </div>

      <ImageUploader
        files={form.images}
        onChange={(images) => onChange({ images })}
        max={MAX_TICKET_IMAGES}
      />
    </div>
  );
}
