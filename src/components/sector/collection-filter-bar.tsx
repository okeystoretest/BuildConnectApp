"use client";

import { Select } from "@/components/ui/select";
import type { CollectionFilter, CollectionOptions } from "@/lib/collection-filters";
import { EMPTY_COLLECTION_FILTER, hasCollectionFilter } from "@/lib/collection-filters";

export interface CollectionFilterBarProps {
  options: CollectionOptions;
  value: CollectionFilter;
  onChange: (value: CollectionFilter) => void;
}

/**
 * Temporada, Coleção e Ano das vitrines — três seletores, não pílulas.
 *
 * Pílula serve para marcação livre que se acumula (as tags das Instruções);
 * aqui cada campo tem um valor só por item, e três listas de seleção dizem
 * isso sem precisar de legenda. Um seletor que não tem opção nenhuma em uso
 * não aparece: lista vazia é um controle que promete filtrar e não filtra.
 */
export function CollectionFilterBar({ options, value, onChange }: CollectionFilterBarProps) {
  const campos = [
    { key: "temporada" as const, label: "Temporada", options: options.temporada },
    { key: "colecao" as const, label: "Coleção", options: options.colecao },
    { key: "ano" as const, label: "Ano", options: options.ano },
  ].filter((campo) => campo.options.length > 0);

  if (campos.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {campos.map((campo) => (
        <Select
          key={campo.key}
          aria-label={`Filtrar por ${campo.label}`}
          value={value[campo.key]}
          onChange={(e) => onChange({ ...value, [campo.key]: e.target.value })}
          options={[{ value: "", label: `${campo.label}: todas` }, ...campo.options]}
          className="h-10 w-auto min-w-[9.5rem] rounded-lg"
        />
      ))}

      {hasCollectionFilter(value) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_COLLECTION_FILTER)}
          className="focus-ring rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
