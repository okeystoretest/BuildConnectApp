"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EvaluationAssignmentPanel } from "@/components/hr/evaluation-assignment-panel";
import { EvaluationResultView } from "@/components/hr/evaluation-result-view";
import { RoundConsolidatedView } from "@/components/hr/round-consolidated-view";
import { fetchEvaluationDetail } from "@/lib/evaluation-results-actions";
import { fetchRoundConsolidated } from "@/lib/evaluation-rounds-actions";
import { cn } from "@/lib/utils";
import type {
  AssignableEvaluationType,
  EfficacyConsolidated,
  EfficacyRoundRow,
  EvaluationResultDetail,
  EvaluationResultEntry,
  EvaluationResultSubject,
  EvaluationResultTypeCard,
  EvaluationSubject,
} from "@/types/evaluation";

export interface EvaluationResultsPanelProps {
  /** Nível 1: um card por instrumento, já com avaliados e registros dentro. */
  catalog: readonly EvaluationResultTypeCard[];
  /** Card "Atribuir Avaliações". */
  assignableTypes: readonly AssignableEvaluationType[];
  assignSubjects: readonly EvaluationSubject[];
  assignRaters: readonly { id: string; name: string; sector: string }[];
  rounds: readonly EfficacyRoundRow[];
}

/** Card especial de atribuição — não é um instrumento, é uma ação. */
const ASSIGN_KEY = "__atribuir__";

/**
 * Aba "Resultados de Avaliações" em três níveis:
 *   1. cards dos instrumentos (+ card "Atribuir Avaliações");
 *   2. escolha do colaborador avaliado;
 *   3. o resultado em si, ocupando a tela inteira.
 */
export function EvaluationResultsPanel({
  catalog,
  assignableTypes,
  assignSubjects,
  assignRaters,
  rounds,
}: EvaluationResultsPanelProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);

  const selectedType = catalog.find((t) => t.slug === openKey) ?? null;
  const selectedSubject = selectedType?.subjects.find((s) => s.subjectId === subjectId) ?? null;

  // Nível 1 — seleção do que consultar.
  if (!openKey) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Escolha a avaliação que deseja consultar. Depois selecione o colaborador avaliado para ver
          o resultado completo.
        </p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={() => setOpenKey(ASSIGN_KEY)}
            className="focus-ring flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:border-primary/70 hover:bg-primary/10"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <UserPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-foreground">
                Atribuir Avaliações
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {rounds.length > 0
                  ? `${rounds.length} ${rounds.length === 1 ? "atribuição" : "atribuições"} em andamento`
                  : "Designe avaliadores para métodos multiavaliador"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
          </button>

          {catalog.map((type) => (
            <TypeCard key={type.slug} type={type} onOpen={() => setOpenKey(type.slug)} />
          ))}
        </div>
      </div>
    );
  }

  // Card de atribuição.
  if (openKey === ASSIGN_KEY) {
    return (
      <div className="space-y-4">
        <Breadcrumb onBack={() => setOpenKey(null)} trail={["Atribuir Avaliações"]} />
        <EvaluationAssignmentPanel
          types={assignableTypes}
          subjects={assignSubjects}
          raters={assignRaters}
          rounds={rounds}
        />
      </div>
    );
  }

  if (!selectedType) {
    return (
      <div className="space-y-4">
        <Breadcrumb onBack={() => setOpenKey(null)} trail={["Instrumento"]} />
        <EmptyState title="Instrumento não encontrado" />
      </div>
    );
  }

  // Nível 2 — escolha do avaliado.
  if (!selectedSubject) {
    return (
      <div className="space-y-4">
        <Breadcrumb onBack={() => setOpenKey(null)} trail={[selectedType.title]} />

        {selectedType.subjects.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="Nenhum resultado ainda"
            description={`Ninguém foi avaliado em "${selectedType.title}" até agora.`}
          />
        ) : (
          <>
            <p className="text-sm text-muted">
              Selecione o colaborador cujos resultados você quer consultar.
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedType.subjects.map((subject) => (
                <SubjectCard
                  key={subject.subjectId}
                  subject={subject}
                  onOpen={() => setSubjectId(subject.subjectId)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Nível 3 — o resultado.
  return (
    <div className="space-y-4">
      <Breadcrumb
        onBack={() => setSubjectId(null)}
        trail={[selectedType.title, selectedSubject.subjectName]}
        onTrailClick={[() => setOpenKey(null), undefined]}
      />
      <SubjectResults subject={selectedSubject} multiRater={selectedType.multiRater} />
    </div>
  );
}

function TypeCard({
  type,
  onOpen,
}: {
  type: EvaluationResultTypeCard;
  onOpen: () => void;
}) {
  const empty = type.count === 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={empty}
      className={cn(
        "focus-ring flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors",
        empty ? "cursor-not-allowed opacity-60" : "hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
        <BarChart3 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-foreground">{type.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {empty
            ? "Nenhum resultado"
            : `${type.count} ${type.count === 1 ? "registro" : "registros"} · ${type.subjects.length} ${
                type.subjects.length === 1 ? "colaborador" : "colaboradores"
              }`}
        </p>
      </div>
      {type.multiRater && <Badge tone="accent">360°</Badge>}
      {!empty && <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
    </button>
  );
}

function SubjectCard({
  subject,
  onOpen,
}: {
  subject: EvaluationResultSubject;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Users className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{subject.subjectName}</p>
        <p className="mt-0.5 text-xs text-muted">{subject.sector}</p>
        <p className="mt-1 text-[11px] text-muted">
          {subject.entries.length}{" "}
          {subject.entries.length === 1 ? "resultado" : "resultados"} · último em{" "}
          {subject.lastLabel}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </button>
  );
}

/**
 * Nível 3. Quando o colaborador tem mais de um registro do mesmo instrumento
 * (ciclos, rodadas repetidas), uma faixa de seleção fica no topo e só o
 * registro escolhido é renderizado — a tela inteira serve a um resultado.
 */
function SubjectResults({
  subject,
  multiRater,
}: {
  subject: EvaluationResultSubject;
  multiRater: boolean;
}) {
  const first = subject.entries[0];
  const [activeId, setActiveId] = useState(first ? first.id : "");
  const active = subject.entries.find((e) => e.id === activeId) ?? first ?? null;

  if (!active) {
    return <EmptyState title="Nenhum resultado para este colaborador" />;
  }

  return (
    <div className="space-y-4">
      {subject.entries.length > 1 && (
        <div className="scrollbar-slim flex gap-2 overflow-x-auto pb-1">
          {subject.entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setActiveId(entry.id)}
              className={cn(
                "focus-ring shrink-0 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                entry.id === active.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface text-muted hover:bg-surface-2",
              )}
            >
              <span className="block font-semibold">{entryTitle(entry)}</span>
              <span className="block text-[11px] text-muted">{entrySubtitle(entry)}</span>
            </button>
          ))}
        </div>
      )}

      {active.mode === "MULTI" ? (
        <RoundResult roundId={active.id} />
      ) : (
        <SingleResult evaluationId={active.id} />
      )}

      {multiRater && active.mode === "SIMPLES" && (
        <p className="text-xs text-muted">
          Este registro foi preenchido por um único avaliador, fora de uma rodada atribuída.
        </p>
      )}
    </div>
  );
}

function entryTitle(entry: EvaluationResultEntry): string {
  if (entry.mode === "MULTI") return "Rodada multiavaliador";
  return entry.cycle ? `Ciclo ${entry.cycle}` : "Avaliação";
}

function entrySubtitle(entry: EvaluationResultEntry): string {
  if (entry.mode === "MULTI") {
    return entry.finishedAtLabel
      ? `Concluída em ${entry.finishedAtLabel}`
      : `Aberta em ${entry.startedAtLabel}`;
  }
  return `${entry.finishedAtLabel} às ${entry.finishedAtTimeLabel}`;
}

function SingleResult({ evaluationId }: { evaluationId: string }) {
  const [detail, setDetail] = useState<EvaluationResultDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDetail(null);
    setError(null);
    const res = await fetchEvaluationDetail(evaluationId);
    if (res.ok && res.detail) setDetail(res.detail);
    else setError(res.error ?? "Não foi possível carregar este resultado.");
  }, [evaluationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <EmptyState title="Resultado indisponível" description={error} />;
  if (!detail) return <LoadingBlock />;
  return <EvaluationResultView detail={detail} />;
}

function RoundResult({ roundId }: { roundId: string }) {
  const [data, setData] = useState<EfficacyConsolidated | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    const res = await fetchRoundConsolidated(roundId);
    if (res.ok && res.data) setData(res.data);
    else setError(res.error ?? "Não foi possível carregar a consolidação.");
  }, [roundId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <EmptyState title="Consolidação indisponível" description={error} />;
  if (!data) return <LoadingBlock />;
  return <RoundConsolidatedView data={data} />;
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando resultado…
    </div>
  );
}

function Breadcrumb({
  onBack,
  trail,
  onTrailClick,
}: {
  onBack: () => void;
  trail: readonly string[];
  /** Ação de cada item do rastro (o último é sempre estático). */
  onTrailClick?: readonly ((() => void) | undefined)[];
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>
      <nav className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        {trail.map((item, index) => {
          const action = onTrailClick?.[index];
          const last = index === trail.length - 1;
          return (
            <span key={item} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              {action && !last ? (
                <button
                  type="button"
                  onClick={action}
                  className="focus-ring truncate rounded transition-colors hover:text-foreground"
                >
                  {item}
                </button>
              ) : (
                <span className={cn("truncate", last && "font-semibold text-foreground")}>
                  {item}
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
