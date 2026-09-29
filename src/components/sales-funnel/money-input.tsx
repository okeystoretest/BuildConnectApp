"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatarReais, } from "@/lib/sales-funnel/format";
import { parseMoedaParaCentavos } from "@/lib/sales-funnel/math";

/**
 * Campo de dinheiro.
 *
 * Guarda o TEXTO enquanto a pessoa digita e só converte para centavos quando
 * o valor é legível. Converter a cada tecla apagaria o que ela está no meio
 * de escrever — "50.0" viraria "R$ 50,00" e o resto das teclas cairia em
 * cima de um valor que ela não pediu.
 *
 * Valor ilegível vira `null` para o pai, que então sabe distinguir "não
 * preencheu" de "preencheu zero". É por isso que o parser devolve null em vez
 * de NaN convertido em 0.
 */
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
  const [texto, setTexto] = useState(() => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",")));
  const [tocado, setTocado] = useState(false);

  // Quando o valor muda por fora (trocar de funil, recarregar), o texto
  // acompanha — mas nunca enquanto a pessoa está digitando neste campo.
  useEffect(() => {
    if (tocado) return;
    setTexto(cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));
  }, [cents, tocado]);

  const invalido = texto.trim().length > 0 && parseMoedaParaCentavos(texto) === null;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        inputMode="decimal"
        value={texto}
        disabled={disabled}
        placeholder="0,00"
        aria-invalid={invalido || undefined}
        aria-describedby={invalido ? `${id}-erro` : undefined}
        onChange={(e) => {
          const valor = e.target.value;
          setTocado(true);
          setTexto(valor);
          onChange(valor.trim().length === 0 ? null : parseMoedaParaCentavos(valor));
        }}
        onBlur={() => {
          setTocado(false);
          const parsed = parseMoedaParaCentavos(texto);
          // Normaliza a grafia só quando o valor é válido: quem digitou
          // errado continua vendo o que digitou, para poder corrigir.
          if (parsed !== null) setTexto((parsed / 100).toFixed(2).replace(".", ","));
        }}
      />
      {invalido ? (
        <p id={`${id}-erro`} className="text-xs text-danger">
          Valor inválido. Use o formato 50.000,00.
        </p>
      ) : (
        cents !== null && cents > 0 && <p className="text-xs text-muted">{formatarReais(cents)}</p>
      )}
    </div>
  );
}
