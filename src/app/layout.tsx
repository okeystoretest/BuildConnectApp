import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { RoleProvider } from "@/providers/role-provider";
import { SidebarProvider } from "@/providers/sidebar-provider";
import { NavigationProvider } from "@/providers/navigation-provider";
import { ThemeProvider, THEME_SCRIPT } from "@/providers/theme-provider";
import { TicketModalProvider } from "@/providers/ticket-modal-provider";
import { NotificationProvider } from "@/providers/notification-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { TicketModalHost } from "@/components/tickets/ticket-modal-host";
import { getVerifiedSession } from "@/lib/auth/require-user";
import type { CurrentUser, Role } from "@/types";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Build.Connect · Hub de Onboarding",
  description: "Plataforma de integração e conhecimento.",
  icons: { icon: "/favicon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0F0B1A",
};

// Usuário neutro para a tela de login (sem sessão). As rotas protegidas
// nunca renderizam sem sessão — o middleware redireciona antes.
const GUEST_USER: CurrentUser = {
  id: "",
  name: "",
  username: "",
  role: "COLABORADOR",
  sector: "",
  accessSlugs: [],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();
  const user: CurrentUser = session
    ? {
        id: session.userId,
        name: session.fullName,
        username: session.username,
        role: session.role as Role,
        sector: session.sector ?? "",
        avatarPath: session.avatarPath ?? undefined,
        // `null` = ADMIN (acesso total). Preserva a distinção no client.
        accessSlugs: session.accessSlugs ?? null,
      }
    : GUEST_USER;

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${outfit.variable} ${jetbrains.variable} font-sans`}>
        <ThemeProvider>
          <RoleProvider initialUser={user}>
            <NotificationProvider>
              <ToastProvider>
                <SidebarProvider>
                  {/* Navegação client-side: mantém a casca montada entre setores. */}
                  <NavigationProvider>
                    <TicketModalProvider>
                      {children}
                      {/* Vídeo obrigatório: bloqueia toda a plataforma até a conclusão. */}
                      <OnboardingGate />
                      <TicketModalHost />
                    </TicketModalProvider>
                  </NavigationProvider>
                </SidebarProvider>
              </ToastProvider>
            </NotificationProvider>
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
