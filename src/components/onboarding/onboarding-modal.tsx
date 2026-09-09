"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { GatedVideo } from "./gated-video";
import { markPlatformWelcomeWatched } from "@/lib/platform-welcome-actions";

export interface OnboardingModalProps {
  open: boolean;
  /** Caminho público do vídeo (/uploads/...). */
  path: string;
  title: string | null;
  onComplete: () => void;
}

/**
 * Vídeo obrigatório de boas-vindas da plataforma. Não é dispensável: o acesso
 * só libera quando a reprodução chega ao fim.
 *
 * Até aqui isto era uma SIMULAÇÃO — um contador de 12 segundos, sem arquivo
 * nenhum, e a marca de "assistido" no localStorage. Agora é o arquivo que a
 * administração publicou, e a marca é gravada no usuário.
 *
 * Falha de carregamento NÃO prende ninguém: se o arquivo não abrir, o acesso é
 * liberado com aviso e sem marcar como assistido — o vídeo volta no próximo
 * acesso, quando o arquivo estiver de pé. Mesma regra do vídeo de setor.
 */
export function OnboardingModal({ open, path, title, onComplete }: OnboardingModalProps) {
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function enter() {
    setSaving(true);
    if (!failed) await markPlatformWelcomeWatched();
    setSaving(false);
    onComplete();
  }

  const canEnter = finished || failed;

  return (
    <Modal
      open={open}
      dismissible={false}
      title="Bem-vindo(a) à Build.Connect"
      description={
        title ?? "Assista ao vídeo de integração completo para liberar o acesso à plataforma."
      }
      className="max-w-5xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Progress value={progress} label="Progresso do vídeo" />
            <p
              className={cn(
                "mt-1.5 text-xs transition-colors",
                finished ? "text-primary" : "text-muted",
              )}
            >
              {failed
                ? "Não foi possível carregar o vídeo."
                : finished
                  ? "Vídeo concluído — acesso liberado."
                  : `${Math.round(progress)}% assistido`}
            </p>
          </div>
          <Button onClick={enter} disabled={!canEnter || saving} className="shrink-0">
            {saving ? "Entrando" : "Continuar para a plataforma"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <GatedVideo
          src={path}
          finished={finished}
          onProgress={setProgress}
          onFinished={() => setFinished(true)}
          onFailed={() => setFailed(true)}
        />

        {failed && (
          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-foreground">
              O arquivo do vídeo não pôde ser carregado. O acesso foi liberado, mas a visualização
              não será registrada — o vídeo volta a aparecer no próximo acesso. Avise a
              administração.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
