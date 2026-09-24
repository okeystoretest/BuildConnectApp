import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { RoleProvider } from "@/providers/role-provider";
import { SidebarProvider } from "@/providers/sidebar-provider";
import { NavigationProvider } from "@/providers/navigation-provider";
import { ThemeProvider, THEME_SCRIPT } from "@/providers/theme-provider";
import { TicketModalProvider } from "@/providers/ticket-modal-provider";
import { NotificationProvider } from "@/providers/notification-provider";
import { PendingEvaluationsProvider } from "@/providers/pending-evaluations-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { countMyPendingEvaluations } from "@/lib/evaluation-rounds";
import { listMyNotifications } from "@/lib/notifications/data";
import { getPlatformWelcomeVideo } from "@/lib/platform-welcome-data";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { TicketModalHost } from "@/components/tickets/ticket-modal-host";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { canUseDhoTools } from "@/lib/auth/access";
import type { CurrentUser, Role } from "@/types";

// Fontes servidas do repositório, e não buscadas no Google durante o build.
//
// `next/font/google` faz duas chamadas HTTP a cada build — o CSS em
// fonts.googleapis.com e os .woff2 em fonts.gstatic.com — e o build inteiro
// morre se a resposta vier fora do formato esperado. Foi o que derrubou o
// deploy de 24/09: o loader do Next assume que toda URL termina em extensão
// de fonte e faz `.exec(url)[1]` sem conferir, então estourou com "Cannot
// read properties of null (reading '1')", sem citar fonte em lugar nenhum.
// E `.next` está no .dockerignore: não há cache para amparar, todo build no
// Docker refaz a busca do zero.
//
// Com os arquivos aqui, o build não fala com ninguém. O ganho maior não é
// evitar aquele erro — é o build voltar a ser reproduzível: reconstruir um
// commit antigo passa a dar o mesmo resultado de sempre, que é exatamente o
// que se precisa na hora de um rollback.
//
// São os mesmos bytes que a aplicação já servia: os arquivos do subset LATIN
// do Google Fonts (Outfit v15, JetBrains Mono v24). Em runtime nada muda —
// o navegador sempre pegou a fonte da nossa origem, nunca do Google, e a
// política `font-src 'self'` do next.config continua valendo.
//
// O subset latin (U+0000-00FF mais pontuação) cobre o português inteiro,
// acentos e cedilha incluídos — e era o subset que este arquivo já declarava.
// Caractere fora dele (ł, ř, ő) cai no system-ui, glifo a glifo.
//
// PARA ATUALIZAR: baixe o .woff2 latin novo em fonts.googleapis.com/css2 e
// troque o arquivo. Nada aqui se atualiza sozinho, e é essa a intenção.

// Variável de 100 a 900, como o Google declarava: um arquivo cobre a faixa
// toda. A tela usa 400, 500, 600 e 700.
const outfit = localFont({
  src: "./fonts/outfit-latin-variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-outfit",
  display: "swap",
});

// Faixa 400–500 de propósito, e não a do arquivo: o Google servia só essas
// duas faces, então `font-mono font-bold` sempre foi engordado pelo
// navegador. Abrir a faixa aqui mudaria o traço desses lugares — esta troca
// muda de onde vêm os bytes, não o desenho da tela.
const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin-variable.woff2",
  weight: "400 500",
  style: "normal",
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Build.Connect · Hub de Gestão Inteligente",
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

  // Vínculo com o DHO: decide se o setor aparece na barra lateral. Resolvido a
  // cada requisição, e não guardado no cookie — mover alguém de setor não
  // invalida a sessão, então o token continuaria afirmando a lotação antiga.
  // A página do DHO e as actions conferem de novo por conta própria; esconder
  // o menu não é tranca.
  const dhoMember = session
    ? await canUseDhoTools(session.userId, session.role as Role)
    : false;

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
        dhoMember,
      }
    : GUEST_USER;

  // Contagem inicial do indicador de "Minhas Avaliações", já renderizada — o
  // número aparece certo na primeira pintura, sem piscar de zero. Sem sessão
  // (tela de login) não há o que contar e nem consulta é feita.
  const pendingEvaluations = session ? await countMyPendingEvaluations(session.userId) : 0;

  // Sino: a lista inicial já vem do servidor, pelo mesmo motivo. `null` sem
  // sessão desliga o polling na tela de login.
  const notifications = session
    ? await listMyNotifications(session.userId, session.role as Role)
    : null;

  // Vídeo obrigatório da plataforma. A resposta vem pronta do servidor para o
  // modal não piscar na primeira pintura — e, principalmente, para a marca de
  // "já assistiu" ser do USUÁRIO, e não do navegador como era no localStorage.
  const platformWelcome = await getPlatformWelcomeVideo(session?.userId ?? null);

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${outfit.variable} ${jetbrains.variable} font-sans`}>
        <ThemeProvider>
          <RoleProvider initialUser={user}>
            <NotificationProvider initial={notifications}>
              <PendingEvaluationsProvider initialCount={pendingEvaluations}>
                <ToastProvider>
                  <SidebarProvider>
                    {/* Navegação client-side: mantém a casca montada entre setores. */}
                    <NavigationProvider>
                      <TicketModalProvider>
                        {children}
                        {/* Vídeo obrigatório: bloqueia toda a plataforma até a conclusão. */}
                        <OnboardingGate
                          path={platformWelcome.path}
                          title={platformWelcome.title}
                          pending={platformWelcome.pending}
                        />
                        <TicketModalHost />
                      </TicketModalProvider>
                    </NavigationProvider>
                  </SidebarProvider>
                </ToastProvider>
              </PendingEvaluationsProvider>
            </NotificationProvider>
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
