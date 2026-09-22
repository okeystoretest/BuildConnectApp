"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  COMPREHENSION_GRADE_MAX,
  COMPREHENSION_GRADE_MIN,
  COMPREHENSION_PASS_MIN,
  COMPREHENSION_QUESTION,
} from "@/lib/video-comprehension";
import { gradeVideoComprehension } from "@/lib/video-comprehension-actions";
import type { VideoComprehensionTask } from "@/types/evaluation";

export interface ComprehensionGradeModalProps {
  task: VideoComprehensionTask;
  onClose: () => void;
  onGraded: () => void;
}

const GRADES = Array.from(
  { length: COMPREHENSION_GRADE_MAX - COMPREHENSION_GRADE_MIN + 1 },
  (_, i) => i + COMPREHENSION_GRADE_MIN,
);

/**
 * O Gestor lê a resposta do colaborador sobre uma Instrução em Vídeo e dá a
 * nota de 0 a 10 (comentário opcional). O vídeo abre em outra aba: o Gestor
 * pode nunca ter visto aquela instrução.
 */
export function ComprehensionGradeModal({ task, onClose, onGraded }: ComprehensionGradeModalProps) {
  const [grade, setGrade] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (grade == null || pending) return;
    setError(null);
    start(async () => {
      const res = await gradeVideoComprehension({
        id: task.comprehensionId,
        grade,
        comment: comment.trim() || undefined,
      });
      if (res.ok) onGraded();
      else setError(res.error ?? "Não foi possível registrar a nota.");
    });
  }

  return (
    <Modal
      open
      onClose={pending ? undefined : onClose}
      title={`Compreensão de vídeo · ${task.authorName}`}
      description={task.videoTitle}
      className="max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {error ? <p className="text-xs text-danger">{error}</p> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={grade == null || pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar nota
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {task.videoPath && (
          <a
            href={task.videoPath}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Assistir ao vídeo
          </a>
        )}

        <section>
          <p className="text-xs font-medium text-muted">{COMPREHENSION_QUESTION}</p>
          <blockquote className="mt-2 whitespace-pre-wrap rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed text-foreground">
            {task.answer}
          </blockquote>
          <p className="mt-1.5 text-[11px] text-muted">Enviada em {task.submittedAtLabel}</p>
        </section>

        <section>
          <Label>
            Nível de compreensão ({COMPREHENSION_GRADE_MIN} a {COMPREHENSION_GRADE_MAX})
          </Label>
          <p className="mt-1 text-[11px] text-muted">
            Abaixo de {COMPREHENSION_PASS_MIN}, o colaborador assiste ao vídeo e responde de novo.
          </p>
          <div
            role="radiogroup"
            aria-label="Nota"
            className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-10"
          >
            {GRADES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={grade === n}
                onClick={() => setGrade(n)}
                disabled={pending}
                className={cn(
                  "focus-ring h-10 rounded-lg border text-sm font-semibold transition-colors",
                  grade === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <section>
          <Label htmlFor="comprehension-comment">Comentário (opcional)</Label>
          <Textarea
            id="comprehension-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Observações para o DHO sobre esta resposta."
            className="mt-2"
            disabled={pending}
          />
        </section>
      </div>
    </Modal>
  );
}
