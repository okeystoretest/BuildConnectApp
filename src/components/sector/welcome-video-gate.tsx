"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { GatedVideo } from "@/components/onboarding/gated-video";
import { markWelcomeVideoWatched } from "@/lib/welcome-video-actions";

export interface WelcomeVideoGateProps {
  /** Slug do subsetor (a página em que o usuário entrou). */
  slug: string;
  sectorLabel: string;
  /** Caminho público do vídeo (/uploads/...). */
  path: string;
  title?: string | null;
}

/**
 * Vídeo obrigatório de boas-vindas do setor, na PRIMEIRA visita do usuário.
 *
 * O modal não é dispensável e o botão de entrar só libera quando o vídeo
 * termina. Por isso o player não usa os controles nativos: com eles bastaria
 * arrastar a barra até o fim. O controle é nosso — play/pause e uma barra de
 * progresso somente leitura.
 *
 * A visualização é gravada no banco (por usuário), então ela acompanha a
 * pessoa em qualquer dispositivo e o setor não volta a bloquear.
 *
 * Falha de carregamento NÃO prende ninguém: se o arquivo não abrir, o acesso é
 * liberado com aviso e sem marcar como assistido — o vídeo volta na próxima
 * visita, quando o arquivo estiver de pé.
 */
export function WelcomeVideoGate({ slug, sectorLabel, path, title }: WelcomeVideoGateProps) {
  const [open, setOpen] = useState(true);
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * O portão só fecha DEPOIS que a visualização foi gravada. Antes, o
   * resultado era ignorado: uma falha (sessão vencida, banco fora) fechava o
   * modal do mesmo jeito e o vídeo voltava na próxima visita — para a pessoa,
   * "assisti e apareceu de novo".
   */
  async function enter() {
    setSaving(true);
    setSaveError(null);
    if (!failed) {
      const res = await markWelcomeVideoWatched(slug);
      if (!res.ok) {
        setSaving(false);
        setSaveError(res.error ?? "Não foi possível registrar a visualização.");
        return;
      }
    }
    setSaving(false);
    setOpen(false);
  }

  const canEnter = finished || failed;

  return (
    <Modal
      open={open}
      dismissible={false}
      // Mais largo: o vídeo é o conteúdo da tela, não um detalhe dela. O teto
      // de altura e a rolagem interna vêm do próprio Modal.
      className="max-w-5xl"
      title={`Boas-vindas · ${sectorLabel}`}
      description={
        title ??
        "Assista ao vídeo completo para acessar o setor. Ele é exibido apenas na primeira visita."
      }
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Progress value={progress} label="Progresso do vídeo" />
            <p className={saveError ? "mt-1.5 text-xs text-danger" : "mt-1.5 text-xs text-muted"}>
              {saveError
                ? `${saveError} Tente de novo.`
                : failed
                  ? "Não foi possível carregar o vídeo."
                  : finished
                    ? "Vídeo concluído."
                    : `${Math.round(progress)}% assistido`}
            </p>
          </div>
          <Button onClick={enter} disabled={!canEnter || saving} className="shrink-0">
            {saving ? "Entrando" : saveError ? "Tentar de novo" : "Entrar no setor"}
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
              O arquivo do vídeo não pôde ser carregado. O acesso ao setor foi liberado, mas a
              visualização não será registrada — o vídeo volta a aparecer na próxima visita. Avise o
              responsável pelo setor.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
