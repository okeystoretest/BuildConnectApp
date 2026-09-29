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
/** Centavos -> o texto do campo, no formato que a pessoa digitaria. */
function paraTexto(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
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
  const [texto, setTexto] = useState(() => paraTexto(cents));
  const [focado, setFocado] = useState(false);

  const invalido = texto.trim().length > 0 && parseMoedaParaCentavos(texto) === null;

  /*
   * Sincroniza com o valor de fora — mas nunca por cima do que a pessoa está
   * escrevendo, e nunca por cima de um valor INVÁLIDO.
   *
   * A versão anterior zerava `tocado` no blur, o efeito reagia e, como um
   * texto ilegível já havia empurrado `null` para o pai, o campo ficava em
   * branco: um typo em "50.000,00" apagava da tela o valor salvo, junto com
   * a mensagem que explicava o erro. Quem errou precisa continuar vendo o
   * que errou para poder corrigir.
   */
  useEffect(() => {
    if (focado || invalido) return;
    setTexto(paraTexto(cents));
  }, [cents, focado, invalido]);

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
        onFocus={() => setFocado(true)}
        onChange={(e) => {
          const valor = e.target.value;
          setTexto(valor);
          onChange(valor.trim().length === 0 ? null : parseMoedaParaCentavos(valor));
        }}
        onBlur={() => {
          setFocado(false);
          // Normaliza a grafia só quando o valor é válido.
          const parsed = parseMoedaParaCentavos(texto);
          if (parsed !== null) setTexto(paraTexto(parsed));
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
