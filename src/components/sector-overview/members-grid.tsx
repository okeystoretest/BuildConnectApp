import { SearchX, Users } from "lucide-react";
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
export function MembersGrid({
  members,
  filtered,
}: {
  members: readonly MemberOverview[];
  /** A lista veio vazia por causa da busca, e não por falta de gente. */
  filtered?: boolean;
}) {
  if (members.length === 0) {
    // Os dois vazios dizem coisas diferentes, e confundi-los faria a pessoa
    // achar que o setor está deserto quando ela só digitou um nome errado.
    return filtered ? (
      <EmptyState
        icon={<SearchX className="h-5 w-5" />}
        title="Nenhum colaborador com esse nome"
        description="Ajuste a busca para ver as pessoas deste setor."
      />
    ) : (
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
