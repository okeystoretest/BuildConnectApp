"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  Loader2,
  MonitorPlay,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { EvaluationResultView } from "@/components/hr/evaluation-result-view";
import { FormResponseView } from "@/components/me/form-response-view";
import { fetchMyEvaluationDetail, fetchMyFormResponse } from "@/lib/my-evaluations-history-actions";
import { paginate } from "@/lib/paginate";
import type {
  AnsweredEvaluation,
  AnsweredEvaluationKind,
  EvaluationResultDetail,
} from "@/types/evaluation";
import type { FormResponseDetail } from "@/types/form";

const PAGE_SIZE = 10;

const KIND: Record<
  AnsweredEvaluationKind,
  { label: string; tone: "primary" | "accent" | "info" | "neutral"; icon: React.ReactNode }
> = {
  FEEDBACK: { label: "Feedback", tone: "accent", icon: <Users className="h-5 w-5" /> },
  AUTOAVALIACAO: {
    label: "Autoavaliação",
    tone: "primary",
    icon: <UserCheck className="h-5 w-5" />,
  },
  FORMULARIO: { label: "Formulário", tone: "info", icon: <FileText className="h-5 w-5" /> },
  COMPREENSAO_VIDEO: {
    label: "Compreensão",
    tone: "neutral",
    icon: <MonitorPlay className="h-5 w-5" />,
  },
};

const ICON_TONE: Record<AnsweredEvaluationKind, string> = {
  FEEDBACK: "bg-accent/15 text-accent",
  AUTOAVALIACAO: "bg-primary/15 text-primary",
  FORMULARIO: "bg-info/15 text-info",
  COMPREENSAO_VIDEO: "bg-surface-3 text-muted",
};

/** Linha da lista: o que foi respondido, quando, e o botão para reler. */
function Row({ item, onOpen }: { item: AnsweredEvaluation; onOpen: () => void }) {
  const kind = KIND[item.kind];
  /*
   * Compreensão não abre detalhe: a nota e o comentário já estão na própria
   * linha. Um clique para revelar duas frases é um clique cobrado à toa.
   */
  const openable = item.kind !== "COMPREENSAO_VIDEO";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              ICON_TONE[item.kind],
            )}
          >
            {kind.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {item.subjectName ? `${item.subjectName} · ` : ""}
              {item.answeredAtLabel} às {item.answeredAtTimeLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {item.scoreLabel && (
            <span className="text-sm font-semibold text-foreground">{item.scoreLabel}</span>
          )}
          <Badge tone={kind.tone}>{kind.label}</Badge>
          {openable && (
            <button
              type="button"
              onClick={onOpen}
              className="focus-ring h-8 rounded-lg border border-border px-3 text-xs text-muted transition-colors hover:text-foreground"
            >
              Ver respostas
            </button>
          )}
        </div>
      </div>

      {item.comprehension && (
        <div
          className={cn(
            "mt-3 rounded-lg border p-3",
            item.comprehension.passed
              ? "border-border bg-surface-2"
              : "border-warning/50 bg-warning/10",
          )}
        >
          <p className="text-xs text-foreground">
            Você deu{" "}
            <span className={cn("font-semibold", !item.comprehension.passed && "text-warning")}>
              {item.comprehension.grade}/10
            </span>{" "}
            à resposta de {item.comprehension.authorName} —{" "}
            {item.comprehension.passed ? "aprovada" : "reprovada, o vídeo voltou a pendente"}.
          </p>
          {item.comprehension.comment && (
            <p className="mt-1.5 text-xs text-muted">
              <span className="font-medium text-foreground">Seu comentário:</span>{" "}
              {item.comprehension.comment}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Carrega e exibe o detalhe de uma submissão, ocupando o painel. */
function Detail({ item, onBack }: { item: AnsweredEvaluation; onBack: () => void }) {
  const [evaluation, setEvaluation] = useState<EvaluationResultDetail | null>(null);
  const [form, setForm] = useState<FormResponseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (item.kind === "FORMULARIO") {
      const res = await fetchMyFormResponse(item.id);
      if (res.ok && res.detail) setForm(res.detail);
      else setError(res.error ?? "Não foi possível abrir esta resposta.");
      return;
    }
    const res = await fetchMyEvaluationDetail(item.id);
    if (res.ok && res.detail) setEvaluation(res.detail);
    else setError(res.error ?? "Não foi possível abrir esta avaliação.");
  }, [item.id, item.kind]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar às concluídas
      </button>

      {error && <EmptyState title="Não foi possível abrir" description={error} />}
      {!error && !evaluation && !form && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando suas respostas…
        </div>
      )}
      {evaluation && <EvaluationResultView detail={evaluation} />}
      {form && <FormResponseView detail={form} />}
    </div>
  );
}

/**
 * Aba "Concluídas": tudo o que este usuário já respondeu, numa linha do tempo
 * só — feedbacks de rodada, autoavaliação, formulários do DHO e as notas de
 * compreensão que ele deu como Gestor.
 *
 * Uma lista misturada, e não uma aba por tipo: separar obrigaria a pessoa a
 * lembrar em que aba ela respondeu, que é exatamente o que ela veio aqui
 * descobrir.
 *
 * Espelha a aba de pendências — o que sai de lá entra aqui.
 */
export function AnsweredEvaluationsPanel({ items }: { items: readonly AnsweredEvaluation[] }) {
  const [open, setOpen] = useState<AnsweredEvaluation | null>(null);
  const [page, setPage] = useState(1);

  if (open) return <Detail item={open} onBack={() => setOpen(null)} />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-5 w-5" />}
        title="Nada respondido ainda"
        description="Quando você preencher uma avaliação, responder um formulário do DHO ou der nota a uma resposta de vídeo, o registro fica guardado aqui."
      />
    );
  }

  const current = paginate(items, page, PAGE_SIZE);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        O que você já respondeu, do mais recente para o mais antigo. Só as suas respostas — ninguém
        mais alcança esta lista.
      </p>

      {current.items.map((item) => (
        <Row key={`${item.kind}-${item.id}`} item={item} onOpen={() => setOpen(item)} />
      ))}

      <Pagination page={current} onChange={setPage} noun="registros" className="pt-1" />

      {/* Formulário anônimo não guarda quem respondeu, por desenho. Dizer isso
          evita que a pessoa ache que o envio dela se perdeu. */}
      <p className="border-t border-border pt-3 text-[11px] text-muted">
        Formulários anônimos não aparecem aqui: eles não guardam quem respondeu, e é isso que os
        torna anônimos.
      </p>
    </div>
  );
}
