export type NotificationKind =
  | "CHAMADO_TI"
  | "CHAMADO_MOTORISTAS"
  | "CONTEUDO"
  | "AVALIACAO"
  | "SISTEMA";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdLabel: string;
  read: boolean;
  href?: string;
  /** Setores que recebem esta notificação. */
  audience: readonly string[];
}

/**
 * Regras de recebimento:
 * - TI recebe todo chamado aberto no módulo de TI.
 * - Motoristas recebe todo chamado da Central de Motoristas.
 */
export const NOTIFICATION_AUDIENCE: Record<NotificationKind, readonly string[]> = {
  CHAMADO_TI: ["TI"],
  CHAMADO_MOTORISTAS: ["Motoristas", "Logística"],
  CONTEUDO: ["*"],
  // Avaliações direcionadas usam targetUserId; a audiência de setor fica vazia.
  AVALIACAO: [],
  SISTEMA: ["*"],
};

export const NOTIFICATION_ICON: Record<NotificationKind, string> = {
  CHAMADO_TI: "MonitorSmartphone",
  CHAMADO_MOTORISTAS: "CarFront",
  CONTEUDO: "PlayCircle",
  AVALIACAO: "ClipboardCheck",
  SISTEMA: "Bell",
};

export const NOTIFICATION_TONE: Record<NotificationKind, "info" | "accent" | "primary" | "neutral"> =
  {
    CHAMADO_TI: "info",
    CHAMADO_MOTORISTAS: "accent",
    CONTEUDO: "primary",
    AVALIACAO: "primary",
    SISTEMA: "neutral",
  };
