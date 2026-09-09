"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Envio de arquivo com progresso REAL, para `/api/uploads`.
 *
 * Usa `XMLHttpRequest` e não `fetch` porque só o XHR emite
 * `upload.onprogress` — bytes efetivamente enviados. Com Server Action (ou
 * `fetch`) a tela não tem como saber quanto falta, e um vídeo de 110 MB
 * ficava minutos num "enviando" sem número.
 *
 * As fases importam, e a de "processando" é a que evita mentir na tela:
 *
 *   sending    → o navegador está subindo os bytes. `percent` vai de 0 a 100.
 *   processing → os bytes chegaram. O servidor ainda grava em disco, trata
 *                imagem e escreve no banco. Dar isso como concluído deixaria a
 *                pessoa fechar a aba no meio da gravação.
 *   done/error → o servidor respondeu.
 *
 * A conferência de tamanho no cliente (`validateUploadSizes`) continua sendo
 * feita ANTES de chamar `send`: ela existe para não gastar minutos de barra
 * terminando em recusa, e progresso real não a substitui.
 */

export type UploadPhase = "idle" | "sending" | "processing" | "done" | "error";

export interface UploadResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface UseUploadProgress<T> {
  /** Envia o FormData. `kind` diz à rota qual função executar. */
  send: (kind: string, formData: FormData) => Promise<UploadResult<T>>;
  /** 0–100. Só significa alguma coisa em `sending`. */
  percent: number;
  phase: UploadPhase;
  /** true em `sending` e `processing` — para travar botões e o fechar. */
  busy: boolean;
  /** Volta ao estado inicial (ao reabrir o modal, por exemplo). */
  reset: () => void;
}

export function useUploadProgress<T = { ok: boolean; error?: string }>(): UseUploadProgress<T> {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = useCallback(() => {
    setPercent(0);
    setPhase("idle");
  }, []);

  const send = useCallback((kind: string, formData: FormData): Promise<UploadResult<T>> => {
    formData.set("uploadKind", kind);
    setPercent(0);
    setPhase("sending");

    return new Promise<UploadResult<T>>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", "/api/uploads");

      xhr.upload.onprogress = (event) => {
        // `lengthComputable` é falso quando o navegador não sabe o total
        // (raro com FormData de arquivo). Aí a barra fica onde está em vez de
        // saltar para um número inventado.
        if (!event.lengthComputable || event.total === 0) return;
        setPercent(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      };

      // Bytes entregues; agora é o servidor que trabalha.
      xhr.upload.onload = () => {
        setPercent(100);
        setPhase("processing");
      };

      xhr.onload = () => {
        let parsed: (UploadResult<T> & T) | null = null;
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          parsed = null;
        }
        if (!parsed) {
          setPhase("error");
          resolve({ ok: false, error: "Resposta inválida do servidor." });
          return;
        }
        const ok = parsed.ok !== false && xhr.status < 400;
        setPhase(ok ? "done" : "error");
        resolve(
          ok
            ? { ok: true, data: parsed as T }
            : { ok: false, error: parsed.error ?? "Falha no envio.", data: parsed as T },
        );
      };

      xhr.onerror = () => {
        setPhase("error");
        resolve({ ok: false, error: "Falha de rede durante o envio." });
      };

      xhr.ontimeout = () => {
        setPhase("error");
        resolve({ ok: false, error: "O envio demorou demais e foi interrompido." });
      };

      xhr.onabort = () => {
        setPhase("idle");
        resolve({ ok: false, error: "Envio cancelado." });
      };

      xhr.send(formData);
    });
  }, []);

  return {
    send,
    percent,
    phase,
    busy: phase === "sending" || phase === "processing",
    reset,
  };
}

/** Rótulo pronto para a tela, para as telas não reescreverem o mesmo texto. */
export function uploadPhaseLabel(phase: UploadPhase, percent: number): string {
  switch (phase) {
    case "sending":
      return `Enviando · ${percent}%`;
    case "processing":
      return "Processando…";
    case "done":
      return "Concluído";
    case "error":
      return "Falha no envio";
    default:
      return "";
  }
}
