export type NotificationKind =
  | "CHAMADO_TI"
  | "CHAMADO_MOTORISTAS"
  | "CONTEUDO"
  | "AVALIACAO"
  | "FORMULARIO"
  | "SISTEMA";

/**
 * O item do sino, já recortado para o usuário logado: a audiência ficou no
 * servidor (ver `lib/notifications/core.ts`), aqui só chega o que ele vê.
 */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** ISO; o rótulo relativo ("há 5 min") é calculado na tela. */
  createdAt: string;
  read: boolean;
  href?: string;
}

export const NOTIFICATION_ICON: Record<NotificationKind, string> = {
  CHAMADO_TI: "MonitorSmartphone",
  CHAMADO_MOTORISTAS: "CarFront",
  CONTEUDO: "PlayCircle",
  AVALIACAO: "ClipboardCheck",
  FORMULARIO: "ClipboardList",
  SISTEMA: "Bell",
};

export const NOTIFICATION_TONE: Record<NotificationKind, "info" | "accent" | "primary" | "neutral"> =
  {
    CHAMADO_TI: "info",
    CHAMADO_MOTORISTAS: "accent",
    CONTEUDO: "primary",
    AVALIACAO: "primary",
    FORMULARIO: "primary",
    SISTEMA: "neutral",
  };
