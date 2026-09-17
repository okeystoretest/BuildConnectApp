"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitVideoComprehension } from "@/lib/video-comprehension-actions";
import {
  COMPREHENSION_MAX,
  COMPREHENSION_MIN,
  COMPREHENSION_QUESTION,
} from "@/lib/video-comprehension";

export interface ComprehensionFormProps {
  videoId: string;
  /** Resposta enviada com sucesso. */
  onSubmitted: () => void;
  /** "Responder depois": o card fica com a pendência. */
  onLater: () => void;
}

/**
 * Pergunta de compreensão exibida ao concluir uma Instrução em Vídeo. Vive
 * DENTRO do modal do player (abaixo do vídeo) — um overlay sobre outro
 * brigaria pelo ESC e pela trava de scroll.
 */
export function ComprehensionForm({ videoId, onSubmitted, onLater }: ComprehensionFormProps) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const length = answer.trim().length;
  const valid = length >= COMPREHENSION_MIN && length <= COMPREHENSION_MAX;

  function submit() {
    if (!valid || pending) return;
    setError(null);
    start(async () => {
      const res = await submitVideoComprehension({ videoId, answer: answer.trim() });
      if (res.ok) onSubmitted();
      else setError(res.error ?? "Não foi possível enviar sua resposta.");
    });
  }

  return (
    <section
      aria-label="Avaliação de compreensão"
      className="rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <MessageSquareText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{COMPREHENSION_QUESTION}</h3>
          <p className="mt-0.5 text-xs text-muted">
            Sua resposta vai para o gestor do seu setor, que avalia o nível de compreensão.
          </p>
        </div>
      </div>

      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        maxLength={COMPREHENSION_MAX}
        rows={4}
        placeholder="Explique com suas palavras o que você entendeu da atividade."
        className="mt-3"
        disabled={pending}
        autoFocus
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {length < COMPREHENSION_MIN
            ? `Mínimo de ${COMPREHENSION_MIN} caracteres.`
            : `${length} / ${COMPREHENSION_MAX}`}
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onLater} disabled={pending}>
          Responder depois
        </Button>
        <Button onClick={submit} disabled={!valid || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Enviar resposta
        </Button>
      </div>
    </section>
  );
}
