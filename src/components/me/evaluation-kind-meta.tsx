import { ClipboardCheck, FileText, MonitorPlay, UserCheck, Users } from "lucide-react";
import type { AnsweredEvaluationKind } from "@/types/evaluation";

/**
 * Ícone, rótulo e tom de CADA TIPO de avaliação.
 *
 * Vale para pendência e para concluída: `MyEvaluationTask.kind` e
 * `AnsweredEvaluationKind` são a mesma união, e o quadro desenha os dois lados
 * com este mapa. Por isso ele não mora no módulo das concluídas — morava, por
 * herança, e o card de pendência importava de um arquivo cujo nome dizia o
 * contrário do que ele fazia.
 *
 * É `.tsx` e não `.ts` porque carrega os ícones prontos. O vizinho
 * `evaluation-task-meta.ts` continua puro de propósito: lá moram as REGRAS
 * (qual coluna, qual texto, qual botão), testadas sem React e sem DOM.
 */
export const KIND: Record<
  AnsweredEvaluationKind,
  { label: string; tone: "primary" | "accent" | "info" | "neutral"; icon: React.ReactNode }
> = {
  FEEDBACK: { label: "Feedback", tone: "accent", icon: <Users className="h-5 w-5" /> },
  AUTOAVALIACAO: {
    label: "Autoavaliação",
    tone: "primary",
    icon: <UserCheck className="h-5 w-5" />,
  },
  /*
   * Mesmo tom do feedback — as duas são "avaliar outra pessoa" — e ícone
   * próprio: o que distingue é o rótulo, porque os quatro tons do sistema já
   * estavam tomados e inventar um quinto por um instrumento seria esticar a
   * paleta para resolver nomeação.
   */
  PRE_EFETIVO: {
    label: "Pré-Efetivo",
    tone: "accent",
    icon: <ClipboardCheck className="h-5 w-5" />,
  },
  FORMULARIO: { label: "Formulário", tone: "info", icon: <FileText className="h-5 w-5" /> },
  COMPREENSAO_VIDEO: {
    label: "Compreensão",
    tone: "neutral",
    icon: <MonitorPlay className="h-5 w-5" />,
  },
};

/** Fundo e cor do círculo do ícone, no tom do tipo. */
export const ICON_TONE: Record<AnsweredEvaluationKind, string> = {
  FEEDBACK: "bg-accent/15 text-accent",
  AUTOAVALIACAO: "bg-primary/15 text-primary",
  PRE_EFETIVO: "bg-accent/15 text-accent",
  FORMULARIO: "bg-info/15 text-info",
  COMPREENSAO_VIDEO: "bg-surface-3 text-muted",
};
