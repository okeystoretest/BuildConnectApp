import { cn } from "@/lib/utils";
import type { Diagnostic } from "@/lib/sales-funnel/types";

/**
 * Os diagnósticos do motor, na tela.
 *
 * Este componente NÃO monta frase: o motor já entrega `message` pronta. Se a
 * redação morasse aqui, o mesmo problema teria um texto na tela e outro no
 * teste — e o teste deixaria de dizer o que a pessoa lê.
 *
 * ACESSIBILIDADE. O texto usa `text-foreground`, não a cor do alerta.
 * Medido sobre a superfície do card: a cor de aviso como TEXTO dá 2,14:1 no
 * tema claro, abaixo dos 4,5:1 que a WCAG AA exige para texto normal (no
 * tema escuro dava 8,64:1, então o defeito era só no claro). O mesmo texto em
 * `foreground` dá 17,82:1 no claro e 16,44:1 no escuro.
 *
 * A cor do alerta continua presente — na borda, no fundo e na barra lateral —
 * onde é decoração e não carrega a informação sozinha. Por isso cada linha
 * também diz "Erro"/"Aviso" por extenso: quem não distingue as cores recebe a
 * severidade em palavra.
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
      {ordenados.map((d, i) => {
        const erro = d.severity === "erro";
        return (
          <li
            key={`${d.code}-${d.targetId ?? i}`}
            className={cn(
              "flex items-start gap-2 rounded-md border border-l-4 py-1.5 pl-2 pr-2.5 text-sm text-foreground",
              erro
                ? "border-danger/40 border-l-danger bg-danger/15"
                : "border-warning/40 border-l-warning bg-warning/15",
            )}
          >
            {/* A palavra também em `foreground`: 10px em negrito NÃO se
                qualifica como "texto grande" na WCAG, então precisaria dos
                mesmos 4,5:1. Quem carrega a cor é a barra da esquerda, que é
                decoração — a severidade chega por escrito. */}
            <span className="mt-px shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-70">
              {erro ? "Erro" : "Aviso"}
            </span>
            <span className="min-w-0">{d.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
