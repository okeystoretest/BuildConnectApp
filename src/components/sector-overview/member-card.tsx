"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, Star, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { memberStatus, type MemberOverview, type MemberStatus } from "@/lib/sector-overview";

/**
 * Média ausente vira travessão. Exibir 0,0 marcaria como péssimo quem apenas
 * ainda não tem nota aprovada.
 */
function averageLabel(average: number | null): string {
  if (average === null) return "—";
  return average.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

const STATUS: Record<MemberStatus, { label: string; tone: "neutral" | "info" | "primary" }> = {
  NAO_INICIADO: { label: "Não iniciado", tone: "neutral" },
  EM_ANDAMENTO: { label: "Em andamento", tone: "info" },
  CONCLUIDO: { label: "Concluído", tone: "primary" },
};

/** Um número do card, com o rótulo acima e o ícone identificando o assunto. */
function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold text-foreground", tone)}>{value}</p>
    </div>
  );
}

export function MemberCard({ member }: { member: MemberOverview }) {
  const [showEvaluations, setShowEvaluations] = useState(false);
  const status = STATUS[memberStatus(member.doneItems, member.totalItems)];
  const hasEvaluations = member.evaluations.length > 0;

  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface p-4">
      <header className="flex items-start gap-3">
        <Avatar name={member.name} avatarPath={member.avatarPath} size="h-11 w-11" textSize="text-sm" />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-foreground">{member.name}</h4>
          {/* O cadastro não guarda cargo; o papel é o que existe. */}
          <p className="truncate text-xs text-muted">{member.role}</p>
        </div>
        <Badge tone={status.tone} className="shrink-0">
          {status.label}
        </Badge>
      </header>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted">Progresso</span>
          <span className="text-sm font-semibold text-foreground">{member.progress}%</span>
        </div>
        <Progress
          value={member.progress}
          className="mt-1.5"
          label={`Progresso de ${member.name}`}
        />
        <p className="mt-1.5 text-[11px] text-muted">
          {member.doneItems} de {member.totalItems} itens concluídos
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
        <Metric
          icon={<CalendarDays className="h-3 w-3" />}
          label="Cadastro"
          value={member.sinceLabel}
        />
        <Metric
          icon={<Star className="h-3 w-3" />}
          label="Média"
          value={member.average === null ? "—" : `${averageLabel(member.average)}/10`}
        />
        <Metric
          icon={<TriangleAlert className="h-3 w-3" />}
          label="Reprovações"
          value={String(member.rejections)}
          tone={member.rejections > 0 ? "text-warning" : undefined}
        />
      </div>

      {/* Empurra as duas caixas para a base: numa grade, cards de alturas
          diferentes com o rodapé alinhado leem-se como uma lista. */}
      <div className="mt-3 flex flex-1 flex-col justify-end gap-2">
        <div
          className={cn(
            "rounded-lg border px-3 py-2",
            // Âmbar só quando há vídeo a refazer. Pendência comum é rotina;
            // reprovação é o que pede ação do gestor.
            member.rejections > 0
              ? "border-warning/40 bg-warning/10"
              : "border-border bg-surface-2",
          )}
        >
          <p className="text-[10px] uppercase tracking-wide text-muted">Pendências</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {member.pending === 0
              ? "Nenhuma — conteúdo em dia"
              : `${member.pending} ${member.pending === 1 ? "item" : "itens"} a concluir`}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-2">
          <button
            type="button"
            onClick={() => setShowEvaluations((v) => !v)}
            disabled={!hasEvaluations}
            aria-expanded={hasEvaluations ? showEvaluations : undefined}
            className={cn(
              "focus-ring flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors",
              hasEvaluations ? "hover:bg-surface-3" : "cursor-default",
            )}
          >
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-muted">
                Avaliações
              </span>
              <span className="mt-0.5 block text-sm font-medium text-foreground">
                {hasEvaluations
                  ? `${member.evaluations.length} ${member.evaluations.length === 1 ? "nota dada" : "notas dadas"}`
                  : "Nenhuma nota ainda"}
              </span>
            </span>
            {hasEvaluations && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted transition-transform",
                  showEvaluations && "rotate-180",
                )}
              />
            )}
          </button>

          {hasEvaluations && showEvaluations && (
            <ul className="space-y-1.5 border-t border-border px-3 py-2">
              {member.evaluations.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-foreground">
                      {entry.videoTitle}
                    </span>
                    <span className="block text-[10px] text-muted">
                      {entry.gradedAtLabel}
                      {/* Só a partir da 2ª: marcar "tentativa 1" em todo
                          registro seria ruído. */}
                      {entry.attempt > 1 && ` · tentativa ${entry.attempt}`}
                    </span>
                  </span>
                  {/* Cor nunca sozinha: a palavra vai junto do número. */}
                  <span
                    className={cn(
                      "shrink-0 text-xs font-semibold",
                      entry.passed ? "text-foreground" : "text-warning",
                    )}
                  >
                    {entry.grade}/10
                    <span className="ml-1 text-[10px] font-normal">
                      {entry.passed ? "aprovada" : "reprovada"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
