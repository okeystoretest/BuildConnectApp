import type { AppNotification } from "@/types/notification";
import { NOTIFICATION_AUDIENCE } from "@/types/notification";

export const INITIAL_NOTIFICATIONS: readonly AppNotification[] = [
  {
    id: "n1",
    kind: "CHAMADO_TI",
    title: "Novo chamado #2051",
    body: "Carlos Mendes abriu “Instalar VPN na filial”.",
    createdLabel: "há 12 min",
    read: false,
    href: "/setores/ti",
    audience: NOTIFICATION_AUDIENCE.CHAMADO_TI,
  },
  {
    id: "n2",
    kind: "CHAMADO_MOTORISTAS",
    title: "Manutenção preventiva — ABC-1234",
    body: "Chamado aberto na Central de Motoristas.",
    createdLabel: "há 1 h",
    read: false,
    href: "/setores/motoristas",
    audience: NOTIFICATION_AUDIENCE.CHAMADO_MOTORISTAS,
  },
  {
    id: "n3",
    kind: "CHAMADO_TI",
    title: "Novo chamado #2050",
    body: "Fernanda Lima abriu “Troca de teclado — Recepção”.",
    createdLabel: "há 3 h",
    read: false,
    href: "/setores/ti",
    audience: NOTIFICATION_AUDIENCE.CHAMADO_TI,
  },
  {
    id: "n4",
    kind: "CONTEUDO",
    title: "Novo vídeo em Vendas",
    body: "“Processos principais” foi publicado na sua trilha.",
    createdLabel: "ontem",
    read: false,
    href: "/setores/vendas",
    audience: NOTIFICATION_AUDIENCE.CONTEUDO,
  },
  {
    id: "n5",
    kind: "SISTEMA",
    title: "Integração concluída",
    body: "Você finalizou a trilha de Integração Geral.",
    createdLabel: "12/07",
    read: true,
    audience: NOTIFICATION_AUDIENCE.SISTEMA,
  },
];
