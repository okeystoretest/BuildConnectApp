"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/providers/toast-provider";
import { submitEvaluation } from "@/lib/evaluation-actions";
import { scaleLegendFor } from "@/lib/scale-legend";
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

  /*
   * Largura que a barra de rolagem da lista rouba do conteúdo.
   *
   * A faixa da escala é IRMÃ da lista, e não rola junto — então ela tem a
   * largura cheia do cartão enquanto a lista tem a largura menos a barra.
   * Como as duas são grades ancoradas à direita, a régua da faixa terminava
   * à direita das notas por exatamente essa diferença.
   *
   * Medido, e não fixado num número: a barra vale ~11px no Chrome com
   * `scrollbar-width: thin`, 6px onde vale o `::-webkit-scrollbar` do
   * .scrollbar-slim, e ZERO no macOS, onde ela flutua sobre o conteúdo.
   * Qualquer constante estaria errada em dois dos três casos.
   */
  const listaRef = useRef<HTMLDivElement>(null);
  const [scrollGutter, setScrollGutter] = useState(0);

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
  /*
   * Legenda das escalas puramente numéricas: diz o que "3" quer dizer sem
   * trocar o número do botão pela palavra. Vem nula para quem já se rotula
   * (o Comportamental), que traz a própria legenda mais abaixo.
   */
  const legend = useMemo(
    () => scaleLegendFor({ slug: form.slug, scaleMax: form.scaleMax, scaleLabels: form.scaleLabels }),
    [form.slug, form.scaleMax, form.scaleLabels],
  );
  // Escalas longas (Matriz de Decisão: 1–10) não cabem com o alvo cheio.
  // Reduz o círculo e permite rolagem horizontal da faixa no celular.
  const dense = form.scaleMax > 6;
  // Diâmetro do alvo.
  const dotClass = dense ? "h-9 w-9 text-sm" : "h-11 w-11 text-base";
  // Largura da COLUNA, que deixou de ser a mesma coisa que o diâmetro. A faixa
  // da escala e as linhas PRECISAM usar esta medida igual, ou os círculos saem
  // de baixo dos rótulos; por isso ela continua saindo de um lugar só.
  //
  // Com legenda a coluna abre a partir de `lg`, para caber a palavra inteira
  // ("Insatisfatório" não quebra em duas linhas). Abaixo de `lg` ela segue do
  // tamanho do círculo e quem informa é a linha de legenda: numa janela de
  // ~700px as duas coisas juntas espremeriam o texto do critério a nada.
  const cellClass = legend ? "w-11 lg:w-20" : dense ? "w-9" : "w-11";
  const rowGapClass = dense ? "gap-1.5 sm:gap-2" : "gap-3 sm:gap-4";
  const scaleValues = useMemo(
    () => Array.from({ length: form.scaleMax }, (_, i) => i + 1),
    [form.scaleMax],
  );

  // Remede a cada troca de seção (a lista muda de altura, e a barra pode
  // aparecer ou sumir) e a cada mudança de tamanho do elemento, que é o que
  // cobre o redimensionar da janela.
  useEffect(() => {
    const el = listaRef.current;
    if (!el) {
      setScrollGutter(0);
      return;
    }
    const medir = () => setScrollGutter(el.offsetWidth - el.clientWidth);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [open, page, isSummary]);

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

        {/* Corpo. Nas seções de critérios ele NÃO rola: quem rola é a lista
            dentro do cartão, abaixo da faixa da escala. No resumo, que é
            conteúdo corrido, volta a rolar inteiro. */}
        <div
          className={
            "scrollbar-slim px-7 py-6 " +
            (isSummary
              ? "flex-1 overflow-y-auto"
              : "flex min-h-0 flex-1 flex-col overflow-hidden")
          }
        >
          {!isSummary && legend && (
            /* Some a partir de `lg`, onde a palavra passa a viver na faixa da
               escala, sob o próprio número — ler "Quase sempre" na coluna do 4
               é mais direto que traduzir de uma linha à parte. Abaixo de `lg`
               não cabe fazer isso, e no celular não há faixa nenhuma; sem esta
               linha a escala voltaria a ser números mudos. As duas nunca
               aparecem juntas. Cada botão segue carregando a palavra no
               `title` e no rótulo acessível, em qualquer largura. */
            <p className="mb-3 shrink-0 text-sm leading-relaxed text-muted lg:hidden">
              <span className="font-semibold text-foreground">Legenda: </span>
              {legend.map((l, i) => `${i + 1} = ${l}`).join("   ·   ")}
            </p>
          )}

          {!isSummary && currentSection && (
            // O cartão é uma COLUNA: faixa fixa em cima, lista rolável embaixo.
            //
            // A faixa já foi `sticky`, e cobria as linhas que passavam por baixo
            // dela — meia pergunta aparecendo acima dela. É o que sticky faz, e
            // nenhum ajuste de `top` conserta: enquanto a faixa morar DENTRO do
            // que rola, ela sobrepõe. Sendo irmã da lista, a área rolável começa
            // ABAIXO da faixa: não há o que cobrir, e a escala segue à vista o
            // tempo todo do mesmo jeito.
            //
            // overflow-hidden aqui só recorta os cantos arredondados — o
            // contêiner de rolagem agora é explícito, na lista.
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
              {/* Faixa da escala: o critério à esquerda, a régua à direita.
                  Oculta no celular, onde a linha empilha e os botões descem
                  para baixo da pergunta. */}
              <div
                className="hidden shrink-0 items-center gap-4 border-b border-border bg-surface-2 py-3.5 pl-5 sm:grid"
                style={{
                  gridTemplateColumns: `minmax(0,1fr) auto`,
                  // pl-5 na classe e o resto aqui: é a folga da barra somada ao
                  // mesmo px-5 que as linhas usam, para a régua terminar onde as
                  // notas terminam.
                  paddingRight: `calc(1.25rem + ${scrollGutter}px)`,
                }}
              >
                <span className="text-sm font-bold uppercase tracking-wide text-muted">
                  Critério de avaliação
                </span>
                {/* items-start porque com a palavra embaixo as colunas ficam de
                    alturas diferentes ("Quase sempre" quebra, "Sempre" não), e
                    quem precisa ficar alinhado é o número. */}
                {/* px-0.5 espelha o da faixa de botões das linhas, que existe lá
                    para o anel de foco não ser recortado. Sem ele aqui, os
                    rótulos ficariam 2px fora dos círculos. */}
                <div className={"flex items-start px-0.5 " + rowGapClass}>
                  {scaleValues.map((v) => (
                    <div key={v} className={"flex flex-col items-center gap-1 " + cellClass}>
                      <span className="text-base font-bold text-foreground">{badgeFor(v)}</span>
                      {legend && (
                        <span className="hidden text-center text-[11px] font-medium leading-tight text-muted lg:block">
                          {legend[v - 1]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Linhas: um critério por linha. É ESTE o contêiner que rola. */}
              <div ref={listaRef} className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
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
                            // A célula carrega a largura da COLUNA e o botão fica
                            // centrado nela. Com legenda a coluna é mais larga que
                            // o círculo, e é isto que mantém cada círculo debaixo
                            // do seu rótulo na faixa.
                            <div key={v} className={"flex shrink-0 justify-center " + cellClass}>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={active}
                                aria-label={legend ? `${v} — ${legend[v - 1]}` : labelFor(v)}
                                title={legend ? legend[v - 1] : hasLabels ? labelFor(v) : undefined}
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
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legenda da escala (quando rotulada) */}
          {!isSummary && hasLabels && (
            <p className="mt-4 shrink-0 text-sm text-muted">
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
