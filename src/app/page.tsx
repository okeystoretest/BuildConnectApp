import { redirect } from "next/navigation";
import { LOGIN_EXPIRED_PATH } from "@/lib/auth/login-redirect";
import { AppShell } from "@/components/layout/app-shell";
import { WelcomeBanner } from "@/components/home/welcome-banner";
import { CompanyValues } from "@/components/home/company-values";
import { CultureCard } from "@/components/home/culture-card";
import { InstitutionalVideo } from "@/components/home/institutional-video";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { getOverallProgress } from "@/lib/progress-data";
import { getPlatformWelcomeVideo } from "@/lib/platform-welcome-data";
import { COMPANY_VALUES, CULTURE_TEXT } from "@/lib/company-info";

export default async function HomePage() {
  const session = await getVerifiedSession();
  // Defesa em profundidade: o middleware já protege, mas não renderizamos
  // conteúdo sem sessão.
  if (!session) redirect(LOGIN_EXPIRED_PATH);

  const firstName = session.fullName.split(" ")[0] || session.fullName;
  const [{ overall }, platformWelcome] = await Promise.all([
    getOverallProgress(session.userId),
    getPlatformWelcomeVideo(session.userId),
  ]);

  return (
    <AppShell eyebrow="Visão geral" title="Início">
      <div className="space-y-6">
        <WelcomeBanner firstName={firstName} progress={overall} />
        <InstitutionalVideo
          path={platformWelcome.path}
          title={platformWelcome.title}
          watchedCount={platformWelcome.watchedCount}
        />
        <CompanyValues values={COMPANY_VALUES} />
        <CultureCard text={CULTURE_TEXT} />
      </div>
    </AppShell>
  );
}
