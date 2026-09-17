"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveVideoProgress } from "@/lib/sector-actions";
import { addInterval, isComplete, watchedSeconds, type Interval } from "@/lib/video-watch";

/** Intervalo entre gravações do progresso enquanto o vídeo toca (ms). */
const SAVE_EVERY_MS = 10_000;
/**
 * Salto máximo entre dois `timeupdate` que ainda conta como reprodução
 * contínua. O evento dispara a cada ~250 ms; acima disso foi seek.
 */
const MAX_STEP_SECONDS = 2;

export interface UseVideoWatchOptions {
  videoId: string;
  /** Já cruzou os 80 % no servidor: nada mais a rastrear. */
  reached: boolean;
  /** Segundos já creditados em sessões anteriores (para o aviso de 80 % local). */
  initialWatchedSeconds: number;
  /** Chamado uma vez, quando o servidor confirma os 80 %. */
  onReached?: (result: { completed: boolean }) => void;
}

/**
 * Rastreia os trechos REALMENTE reproduzidos de um `<video>` com controles
 * nativos e grava no servidor: a cada 10 s enquanto toca, ao pausar, ao
 * terminar, ao esconder a aba e ao desmontar. Os 80 % são decididos pelo
 * servidor, que une estes trechos aos das sessões anteriores e diz se isso
 * concluiu o vídeo (vitrines) ou só liberou a pergunta (Instruções em Vídeo);
 * aqui só se antecipa a gravação quando a soma local sugere que cruzou.
 */
export function useVideoWatch({
  videoId,
  reached: initialReached,
  initialWatchedSeconds,
  onReached,
}: UseVideoWatchOptions) {
  const [reached, setReached] = useState(initialReached);
  const saved = useRef(false);
  const pending = useRef<Promise<unknown> | null>(null);

  const intervals = useRef<Interval[]>([]);
  const last = useRef<number | null>(null);
  const duration = useRef<number>(Number.NaN);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const again = useRef(false);
  const reachedRef = useRef(initialReached);
  // A gravação antecipada dispara uma vez; se o servidor discordar (o crédito
  // anterior sobrepunha esta sessão), o ciclo de 10 s segue normalmente.
  const anticipated = useRef(false);
  const onReachedRef = useRef(onReached);
  onReachedRef.current = onReached;

  const flush = useCallback(() => {
    // Os 80 % não voltam atrás e não precisam de mais gravações.
    if (reachedRef.current) return;
    if (!dirty.current || !Number.isFinite(duration.current) || duration.current <= 0) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    dirty.current = false;
    inFlight.current = true;
    const payload = {
      videoId,
      intervals: intervals.current.map(([a, b]) => [a, b] as [number, number]),
      duration: duration.current,
    };
    pending.current = saveVideoProgress(payload)
      .then((res) => {
        if (!res.ok) return;
        saved.current = true;
        if (res.reached && !reachedRef.current) {
          reachedRef.current = true;
          setReached(true);
          onReachedRef.current?.({ completed: Boolean(res.completed) });
        }
      })
      .finally(() => {
        inFlight.current = false;
        if (again.current) {
          again.current = false;
          flush();
        }
      });
  }, [videoId]);

  // Gravação periódica enquanto há algo novo; ao esconder a aba, grava já.
  useEffect(() => {
    const timer = window.setInterval(flush, SAVE_EVERY_MS);
    function onVisibility() {
      if (document.hidden) flush();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [flush]);

  const onLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    duration.current = e.currentTarget.duration;
  }, []);

  const rearm = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    last.current = e.currentTarget.currentTime;
  }, []);

  const onTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      const t = v.currentTime;
      if (v.paused || v.seeking) {
        last.current = t;
        return;
      }
      const from = last.current;
      last.current = t;
      if (from == null) return;
      const step = t - from;
      if (step <= 0 || step > MAX_STEP_SECONDS) return;

      intervals.current = addInterval(intervals.current, from, t);
      dirty.current = true;

      // Soma local (crédito anterior + esta sessão) só antecipa a gravação;
      // quem decide é o servidor, que conhece os trechos de verdade.
      if (
        !reachedRef.current &&
        !anticipated.current &&
        isComplete(initialWatchedSeconds + watchedSeconds(intervals.current), duration.current)
      ) {
        anticipated.current = true;
        flush();
      }
    },
    [flush, initialWatchedSeconds],
  );

  const onPause = useCallback(() => flush(), [flush]);

  /**
   * Espera a gravação em curso (se houver) e diz se ALGUMA gravação chegou ao
   * servidor nesta sessão — quem fecha o player recarrega a página se sim.
   */
  const settle = useCallback(async (): Promise<boolean> => {
    await pending.current;
    return saved.current;
  }, []);

  return {
    reached,
    settle,
    flush,
    videoProps: {
      onLoadedMetadata,
      onPlay: rearm,
      onSeeked: rearm,
      onTimeUpdate,
      onPause,
      onEnded: onPause,
    },
  };
}
