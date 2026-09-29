"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatarReais } from "@/lib/sales-funnel/format";
import { FieldLabel } from "./canvas-block";

/**
 * Campo de dinheiro com máscara BRL.
 *
 * A máscara é de CENTAVOS: cada dígito digitado entra pela direita e empurra
 * os anteriores, então "36500000" vira "R$ 365.000,00" enquanto se digita.
 * É o comportamento padrão de campo monetário no Brasil, e o que dispensa o
 * rótulo de conferência que existia embaixo do campo — o valor formatado É o
 * que está escrito.
 *
 * Colar também funciona: qualquer texto colado é reduzido aos seus dígitos.
 * Campo vazio devolve `null` ao pai, que então distingue "não preencheu" de
 * "preencheu zero".
 */

/** Só os dígitos do que a pessoa digitou ou colou. */
function apenasDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

export function MoneyInput({
  label,
  cents,
  onChange,
  disabled,
  id,
}: {
  label: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  disabled?: boolean;
  id: string;
}) {
  const [texto, setTexto] = useState(() => (cents === null ? "" : formatarReais(cents)));
  const [focado, setFocado] = useState(false);

  /*
   * Sincroniza com o valor de fora — nunca por cima do que está sendo
   * digitado. Com a máscara não existe mais estado inválido: o que não é
   * dígito não entra, então o campo não tem como ficar ilegível.
   */
  useEffect(() => {
    if (focado) return;
    setTexto(cents === null ? "" : formatarReais(cents));
  }, [cents, focado]);

  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        value={texto}
        disabled={disabled}
        placeholder="R$ 0,00"
        className="h-8 text-sm tabular-nums"
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        onChange={(e) => {
          const digitos = apenasDigitos(e.target.value);
          if (digitos.length === 0) {
            setTexto("");
            onChange(null);
            return;
          }
          // O limite acompanha o Decimal(14,2) do banco: acima disso a action
          // recusaria, e recusar na digitação evita a surpresa no Salvar.
          const valor = Math.min(Number(digitos), 999_999_999_99);
          setTexto(formatarReais(valor));
          onChange(valor);
        }}
      />
    </div>
  );
}
