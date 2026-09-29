import { cn } from "@/lib/utils";
import type { Diagnostic } from "@/lib/sales-funnel/types";

/**
 * Os diagnósticos do motor, na tela.
 *
 * Este componente NÃO monta frase: o motor já entrega `message` pronta. Se a
 * redação morasse aqui, o mesmo problema teria um texto na tela e outro no
 * teste — e o teste deixaria de dizer o que a pessoa lê.
 *
 * Erros vêm primeiro: são o que impede o número de existir.
 */
export function DiagnosticsList({
  diagnostics,
  className,
}: {
  diagnostics: readonly Diagnostic[];
  className?: string;
}) {
  if (diagnostics.length === 0) return null;

  const ordenados = [...diagnostics].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "erro" ? -1 : 1,
  );

  return (
    <ul className={cn("space-y-1.5", className)}>
      {ordenados.map((d, i) => (
        <li
          key={`${d.code}-${d.targetId ?? i}`}
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            d.severity === "erro"
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-warning/30 bg-warning/10 text-warning",
          )}
        >
          {d.message}
        </li>
      ))}
    </ul>
  );
}
