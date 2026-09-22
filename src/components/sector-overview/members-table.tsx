import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { MemberOverview } from "@/lib/sector-overview";

/**
 * Média ausente vira travessão. Exibir 0,0 marcaria como péssimo quem apenas
 * ainda não tem nota aprovada.
 */
function averageLabel(average: number | null): string {
  if (average === null) return "—";
  return average.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function MembersTable({ members }: { members: readonly MemberOverview[] }) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="Nenhum colaborador neste setor"
        description="Quando houver pessoas lotadas aqui, o avanço delas aparece nesta tabela."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-2 py-2 font-medium">Colaborador</th>
            <th className="px-2 py-2 font-medium">Progresso</th>
            <th className="px-2 py-2 font-medium">Média</th>
            <th className="px-2 py-2 font-medium">Reprovações</th>
            <th className="px-2 py-2 font-medium">Pendentes</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} className="border-b border-border/60 last:border-0">
              <td className="px-2 py-2.5 text-foreground">{m.name}</td>
              <td className="px-2 py-2.5 text-muted">
                {m.progress}%{" "}
                <span className="text-[11px]">
                  ({m.doneItems}/{m.totalItems})
                </span>
              </td>
              <td className="px-2 py-2.5 font-medium text-foreground">{averageLabel(m.average)}</td>
              <td className="px-2 py-2.5">
                <span className={m.rejections > 0 ? "font-medium text-warning" : "text-muted"}>
                  {m.rejections}
                </span>
              </td>
              <td className="px-2 py-2.5 text-muted">{m.pending}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
