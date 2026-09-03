"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/providers/toast-provider";
import { submitEvaluation } from "@/lib/evaluation-actions";
import type { EvalForm } from "@/types/evaluation";

export interface FormSubmitPayload {
  observations?: string;
  answers: { questionId: string; value: number }[];
}

export interface EvaluationFormModalProps {
  open: boolean;
  onClose: () => void;
  form: EvalForm;
  subjectId: string;
  subjectName: string;
  cycle?: number;
  onSubmitted?: () => void;
  /**
   * Envio customizado. Quando fornecido, substitui o submitEvaluation padrão
   * (usado pela Eficácia, cujo envio é por rodada/autoavaliação). Deve devolver
   * ok + mensagem de erro opcional.
   */
  onSubmit?: (payload: FormSubmitPayload) => Promise<{ ok: boolean; error?: string }>;
  /** Texto do cabeçalho acima do título (sobrescreve o padrão). */
  eyebrow?: string;
}

type Answers = Record<string, number>;

/**
 * Formulário de avaliação em tabela, ocupando boa parte da tela.
 * Cada linha é um critério; as opções ficam à direita, em círculos, sob um
 * cabeçalho com a escala. Paginado por seção, com resumo antes do envio.
 */
export function EvaluationFormModal({
  open,
  onClose,
  form,
  subjectId,
  subjectName,
  cycle,
  onSubmitted,
  onSubmit,
  eyebrow,
}: EvaluationFormModalProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [answers, setAnswers] = useState<Answers>({});
  const [observations, setObservations] = useState("");
  const [page, setPage] = useState(0);
  const [submitting, startSubmit] = useTransition();

  const totalQuestions = useMemo(
    () => form.sections.reduce((n, s) => n + s.questions.length, 0),
    [form],
  );
  const answeredCount = Object.keys(answers).length;

  const summaryPage = form.sections.length;
  const isSummary = page === summaryPage;

  const currentSection = form.sections[page];
  const currentAnswered = currentSection
    ? currentSection.questions.every((q) => answers[q.id] !== undefined)
    : true;

  const total = useMemo(() => Object.values(answers).reduce((s, v) => s + v, 0), [answers]);
  const maxTotal = totalQuestions * form.scaleMax;

  const hasLabels = form.scaleLabels.length === form.scaleMax;
  // Escalas longas (Matriz de Decisão: 1–10) não cabem com o alvo cheio.
  // Reduz o círculo e permite rolagem horizontal da faixa no celular.
  const dense = form.scaleMax > 6;
  // Largura do alvo. O cabeçalho da tabela e as linhas PRECISAM usar a mesma
  // medida para as colunas casarem; por isso ela sai de um lugar só, em vez de
  // dois literais mantidos em sincronia à mão.
  const cellClass = dense ? "w-9" : "w-11";
  const dotClass = cellClass + (dense ? " h-9 text-sm" : " h-11 text-base");
  const rowGapClass = dense ? "gap-1.5 sm:gap-2" : "gap-3 sm:gap-4";
  const scaleValues = useMemo(
    () => Array.from({ length: form.scaleMax }, (_, i) => i + 1),
    [form.scaleMax],
  );

  function setAnswer(questionId: string, value: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function resetAll() {
    setAnswers({});
    setObservations("");
    setPage(0);
  }

  function handleClose() {
    if (submitting) return;
    resetAll();
    onClose();
  }

  function goNext() {
    if (!currentAnswered) return;
    setPage((p) => Math.min(p + 1, summaryPage));
  }
  function goBack() {
    setPage((p) => Math.max(p - 1, 0));
  }

  function handleSubmit() {
    if (answeredCount !== totalQuestions) {
      error("Responda todas as questões antes de enviar.");
      return;
    }
    startSubmit(async () => {
      const payloadAnswers = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
      }));
      const res = onSubmit
        ? await onSubmit({
            observations: observations.trim() || undefined,
            answers: payloadAnswers,
          })
        : await submitEvaluation({
            typeSlug: form.slug,
            subjectId,
            cycle: form.hasCycle ? cycle : undefined,
            observations: observations.trim() || undefined,
            answers: payloadAnswers,
          });
      if (res.ok) {
        success("Avaliação enviada com sucesso");
        resetAll();
        onClose();
        onSubmitted?.();
        router.refresh();
      } else {
        error(res.error ?? "Não foi possível enviar a avaliação.");
      }
    });
  }

  const progressPct = Math.round((answeredCount / Math.max(totalQuestions, 1)) * 100);

  function labelFor(value: number): string {
    return hasLabels ? (form.scaleLabels[value - 1] ?? String(value)) : String(value);
  }
  function badgeFor(value: number): string {
    return hasLabels ? (form.scaleLabels[value - 1]?.charAt(0) ?? "?") : String(value);
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-6xl" dismissible={!submitting}>
      <div className="flex max-h-[92vh] flex-col">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between gap-4 border-b border-border p-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              {eyebrow ?? `${form.hasCycle && cycle ? `Ciclo ${cycle} · ` : ""}${subjectName}`}
            </p>
            <h2 className="mt-1.5 text-2xl font-bold leading-tight text-foreground">{form.title}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Progresso */}
        <div className="border-b border-border px-7 py-4">
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span className="font-medium">
              {isSummary
                ? "Resumo antes do envio"
                : `Seção ${page + 1} de ${form.sections.length} · ${currentSection?.title}`}
            </span>
            <span>
              {answeredCount}/{totalQuestions} respondidas
            </span>
          </div>
          <Progress value={progressPct} />
        </div>

        {/* Corpo */}
        <div className="scrollbar-slim flex-1 overflow-y-auto px-7 py-6">
          {!isSummary && currentSection && (
            // overflow-clip (e não overflow-hidden) recorta os cantos
            // arredondados SEM criar um contêiner de rolagem — é o que deixa o
            // cabeçalho abaixo grudar na borda do corpo rolável. Com
            // overflow-hidden, o sticky se ancoraria neste box, que não rola, e
            // o cabeçalho subiria junto com as linhas até sumir.
            <div className="overflow-clip rounded-xl border border-border">
              {/* Cabeçalho da tabela: critério + escala (oculto no mobile, onde
                  a linha empilha). Sticky: a lista de critérios rola dentro do
                  corpo do modal e a faixa da escala saía de vista logo no
                  primeiro rolar, deixando os círculos sem legenda. */}
              <div className="sticky top-0 z-10 hidden items-center gap-4 border-b border-border bg-surface-2 px-5 py-3.5 sm:grid" style={{ gridTemplateColumns: `minmax(0,1fr) auto` }}>
                <span className="text-sm font-bold uppercase tracking-wide text-muted">
                  Critério de avaliação
                </span>
                <div className={"flex items-center " + rowGapClass}>
                  {scaleValues.map((v) => (
                    <div key={v} className={"flex flex-col items-center gap-1 " + cellClass}>
                      <span className="text-base font-bold text-foreground">{badgeFor(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linhas: um critério por linha */}
              {currentSection.questions.map((q, idx) => {
                const rowNumber = globalIndex(form, page, idx);
                const selected = answers[q.id];
                return (
                  <div
                    key={q.id}
                    className={
                      "flex flex-col gap-3 border-b border-border px-5 py-4 last:border-0 transition-colors sm:grid sm:items-center sm:gap-4 " +
                      (idx % 2 === 0 ? "bg-surface" : "bg-surface-2/40")
                    }
                    style={{ gridTemplateColumns: `minmax(0,1fr) auto` }}
                  >
                    <div className="min-w-0">
                      <p className="text-base font-semibold leading-snug text-foreground">
                        <span className="mr-2 text-muted">{rowNumber}.</span>
                        {q.label}
                      </p>
                      {q.helpText && (
                        <p className="mt-1 text-sm leading-relaxed text-muted">{q.helpText}</p>
                      )}
                    </div>

                    <div
                      className={
                        // A faixa só rola de fato nas escalas longas (1–10) em
                        // tela estreita; nas curtas ela cabe inteira.
                        //
                        // overflow-y-hidden é obrigatório: com overflow-x-auto o
                        // navegador computa overflow-y como auto, e qualquer
                        // transbordo de 1px viraria barra de rolagem vertical na
                        // linha respondida.
                        //
                        // O padding dá a folga para o anel do botão ativo não
                        // ser recortado pela borda de rolagem. Ele é sombra, não
                        // caixa: ao contrário do scale que havia aqui antes, não
                        // entra na área rolável e não força barra horizontal.
                        "scrollbar-slim flex max-w-full items-center overflow-x-auto overflow-y-hidden px-0.5 py-1 " +
                        rowGapClass
                      }
                      role="radiogroup"
                      aria-label={q.label}
                    >
                      {scaleValues.map((v) => {
                        const active = selected === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={labelFor(v)}
                            title={hasLabels ? labelFor(v) : undefined}
                            onClick={() => setAnswer(q.id, v)}
                            className={
                              "focus-ring flex shrink-0 items-center justify-center rounded-full border-2 font-bold transition-all " +
                              dotClass +
                              " " +
                              (active
                                ? "border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/40"
                                : "border-border bg-surface text-muted hover:border-primary/50 hover:text-foreground")
                            }
                          >
                            {badgeFor(v)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legenda da escala (quando rotulada) */}
          {!isSummary && hasLabels && (
            <p className="mt-4 text-sm text-muted">
              <span className="font-semibold text-foreground">Legenda: </span>
              {form.scaleLabels.map((l) => `${l.charAt(0)} = ${l}`).join("   ·   ")}
            </p>
          )}

          {isSummary && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <ClipboardCheck className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-lg font-bold text-foreground">
                    Pontuação total: {total} / {maxTotal}
                  </p>
                  <p className="text-sm text-muted">
                    {answeredCount} de {totalQuestions} critérios ·{" "}
                    {hasLabels
                      ? form.scaleLabels.map((l) => l.charAt(0)).join("/")
                      : `escala 1 a ${form.scaleMax}`}
                  </p>
                </div>
              </div>

              {/* Espelho das respostas, em tabela */}
              <div className="overflow-hidden rounded-xl border border-border">
                {form.sections.flatMap((s) => s.questions).map((q, i) => (
                  <div
                    key={q.id}
                    className={
                      "flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-0 " +
                      (i % 2 === 0 ? "bg-surface" : "bg-surface-2/40")
                    }
                  >
                    <span className="min-w-0 flex-1 text-base text-foreground">
                      <span className="mr-2 text-muted">{i + 1}.</span>
                      {q.label}
                    </span>
                    <span className="shrink-0 text-base font-bold text-primary">
                      {answers[q.id] === undefined ? "—" : labelFor(answers[q.id]!)}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <label htmlFor="obs" className="mb-2 block text-sm font-medium text-foreground">
                  Observações (opcional)
                </label>
                <Textarea
                  id="obs"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Anote pontos de destaque ou de atenção."
                  rows={4}
                />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <footer className="flex items-center justify-between gap-3 border-t border-border p-5">
          <Button variant="ghost" size="lg" onClick={goBack} disabled={page === 0 || submitting}>
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Button>

          {!isSummary ? (
            <Button size="lg" onClick={goNext} disabled={!currentAnswered}>
              {page === summaryPage - 1 ? "Revisar" : "Próximo"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={submitting || answeredCount !== totalQuestions}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Enviando" : "Enviar avaliação"}
            </Button>
          )}
        </footer>
      </div>
    </Modal>
  );
}

/** Índice global (1-based) de um critério, considerando as seções anteriores. */
function globalIndex(form: EvalForm, page: number, localIdx: number): number {
  let base = 0;
  for (let i = 0; i < page; i += 1) base += form.sections[i]?.questions.length ?? 0;
  return base + localIdx + 1;
}
