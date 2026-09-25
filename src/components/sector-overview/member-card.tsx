"use client";

import { useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  PlayCircle,
  Star,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import {
  groupPending,
  memberStatus,
  type MemberOverview,
  type MemberStatus,
  type PendingContentGroup,
} from "@/lib/sector-overview";

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

/** Ícone de cada mídia no modal de pendências, pelo nome que o agrupador dá. */
const PENDING_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PlayCircle,
  FileText,
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

/**
 * Um dos dois botões do rodapé do card.
 *
 * É um botão desenhado aqui, e não o `Button` comum: os dois precisam do mesmo
 * bloco de rótulo + número grande e de tons próprios — âmbar para o que cobra
 * ação, primário para o que é consulta. Levar isso ao `Button` por `className`
 * acabaria reescrevendo o componente inteiro no ponto de uso, duas vezes.
 *
 * Contagem zero desabilita: abrir um modal para ler "nada aqui" é um clique que
 * a tela já podia ter respondido — e o próprio botão responde.
 */
function CardAction({
  icon,
  label,
  count,
  emptyLabel,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  emptyLabel: string;
  tone: "warning" | "primary";
  onClick: () => void;
}) {
  const empty = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      aria-haspopup={empty ? undefined : "dialog"}
      className={cn(
        "focus-ring flex min-w-0 flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors",
        empty
          ? "cursor-default border-border bg-surface-2"
          : tone === "warning"
            ? "border-warning/40 bg-warning/10 hover:border-warning/60 hover:bg-warning/20"
            : "border-primary/40 bg-primary/10 hover:border-primary/60 hover:bg-primary/20",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1 text-[10px] uppercase tracking-wide",
          empty ? "text-muted" : tone === "warning" ? "text-warning" : "text-primary",
        )}
      >
        {icon}
        {label}
      </span>
      {empty ? (
        <span className="mt-0.5 truncate text-xs text-muted">{emptyLabel}</span>
      ) : (
        <span
          className={cn(
            "mt-0.5 text-lg font-bold leading-tight",
            tone === "warning" ? "text-warning" : "text-primary",
          )}
        >
          {count}
          {/* O substantivo fica pequeno para o número não perder o peso. */}
          <span className="ml-1 text-[11px] font-medium text-muted">
            {count === 1 ? "item" : "itens"}
          </span>
        </span>
      )}
    </button>
  );
}

/** Lista de pendências de uma mídia, dentro do modal. */
function PendingGroupList({ group }: { group: PendingContentGroup }) {
  const Icon = PENDING_ICON[group.icon];
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            group.tone === "primary" ? "bg-primary/15 text-primary" : "bg-info/15 text-info",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
        </span>
        {group.label}
        <span className="text-muted">({group.items.length})</span>
      </h4>
      <ul className="space-y-1.5 pl-8">
        {group.items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
            <span className="min-w-0">
              <span className="block break-words">{item.title}</span>
              <span className="block text-[11px] text-muted">{item.subsector}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MemberCard({ member }: { member: MemberOverview }) {
  const [pendingModal, setPendingModal] = useState(false);
  const [evaluationsModal, setEvaluationsModal] = useState(false);
  const status = STATUS[memberStatus(member.doneItems, member.totalItems)];

  const pendingGroups = groupPending(member.pendingList);
  // Um número só no botão: para o gestor as duas listas são "o que já foi
  // avaliado nesta pessoa", e separá-las no rótulo pediria dois botões.
  const evaluationCount = member.evaluations.length + member.performance.length;

  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface p-4">
      <header className="flex items-start gap-3">
        <Avatar
          name={member.name}
          avatarPath={member.avatarPath}
          size="h-11 w-11"
          textSize="text-sm"
        />
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

      {/* Os dois botões, lado a lado e colados na base: numa grade, cards de
          alturas diferentes com o rodapé alinhado leem-se como uma lista.
          Ambas as consultas abrem em modal — o gestor não perde a página, a
          rolagem nem a busca que digitou para chegar até aqui. */}
      <div className="mt-3 flex flex-1 flex-col justify-end">
        <div className="grid grid-cols-2 gap-2">
          <CardAction
            icon={<TriangleAlert className="h-3 w-3" />}
            label="Pendências"
            count={member.pending}
            emptyLabel="Conteúdo em dia"
            tone="warning"
            onClick={() => setPendingModal(true)}
          />
          <CardAction
            icon={<ClipboardList className="h-3 w-3" />}
            label="Avaliações"
            count={evaluationCount}
            emptyLabel="Nenhuma ainda"
            tone="primary"
            onClick={() => setEvaluationsModal(true)}
          />
        </div>
      </div>

      {/* Pendências: o que falta consumir, agrupado por tipo de mídia. */}
      <Modal
        open={pendingModal}
        onClose={() => setPendingModal(false)}
        title="Conteúdos pendentes"
        description={`${member.name} · ${member.pending} ${member.pending === 1 ? "item" : "itens"} a concluir`}
        className="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setPendingModal(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        <div className="scrollbar-slim max-h-[60vh] space-y-5 overflow-y-auto p-6">
          {pendingGroups.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma pendência.</p>
          ) : (
            pendingGroups.map((group) => <PendingGroupList key={group.label} group={group} />)
          )}
        </div>
      </Modal>

      {/* Avaliações: notas de compreensão de vídeo e avaliações de desempenho. */}
      <Modal
        open={evaluationsModal}
        onClose={() => setEvaluationsModal(false)}
        title="Avaliações"
        description={`${member.name} · ${evaluationCount} ${evaluationCount === 1 ? "registro" : "registros"}`}
        className="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setEvaluationsModal(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        <div className="scrollbar-slim max-h-[60vh] space-y-6 overflow-y-auto p-6">
          {member.evaluations.length > 0 && (
            <section>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Compreensão de vídeo
              </h4>
              <ul className="space-y-2">
                {member.evaluations.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block break-words text-sm text-foreground">
                        {entry.videoTitle}
                      </span>
                      <span className="block text-[11px] text-muted">
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
            </section>
          )}

          {member.performance.length > 0 && (
            <section>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Desempenho
              </h4>
              <ul className="space-y-2">
                {member.performance.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block break-words text-sm text-foreground">
                        {entry.title}
                        {entry.cycleLabel && (
                          <span className="text-muted"> · {entry.cycleLabel}</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {entry.createdAtLabel} ·{" "}
                        {/* Autoavaliação sai marcada: a nota que a pessoa deu a
                            si mesma não pode ser lida como a do gestor. */}
                        {entry.selfAssessment ? "autoavaliação" : entry.evaluatorName}
                      </span>
                    </span>
                    {entry.total !== null && (
                      <span className="shrink-0 text-xs font-semibold text-foreground">
                        {entry.total}
                        {entry.maxTotal !== null && (
                          <span className="font-normal text-muted">/{entry.maxTotal}</span>
                        )}
                        <span className="ml-1 text-[10px] font-normal text-muted">pontos</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {evaluationCount === 0 && <p className="text-sm text-muted">Nenhuma avaliação ainda.</p>}
        </div>
      </Modal>
    </article>
  );
}
