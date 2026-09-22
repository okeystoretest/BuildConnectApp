import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberCard } from "./member-card";
import type { MemberOverview } from "@/lib/sector-overview";

/**
 * Os colaboradores do setor, um card por pessoa.
 *
 * Era uma tabela de cinco colunas. Tabela é boa para comparar a mesma medida
 * entre muitas linhas; aqui a pergunta do gestor é sobre UMA pessoa de cada
 * vez ("quem está parado, e por quê?"), e a resposta precisa de foto, barra e
 * duas listas que não cabem numa célula.
 */
export function MembersGrid({ members }: { members: readonly MemberOverview[] }) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="Nenhum colaborador neste setor"
        description="Quando houver pessoas lotadas aqui, o avanço delas aparece nesta lista."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {members.map((m) => (
        <MemberCard key={m.userId} member={m} />
      ))}
    </div>
  );
}
