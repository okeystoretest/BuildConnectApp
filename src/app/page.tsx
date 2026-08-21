import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { WelcomeBanner } from "@/components/home/welcome-banner";
import { CompanyValues } from "@/components/home/company-values";
import { CultureCard } from "@/components/home/culture-card";
import { InstitutionalVideo } from "@/components/home/institutional-video";
import { getSession } from "@/lib/auth/session";
import { getOverallProgress } from "@/lib/progress-data";
import { COMPANY_VALUES, CULTURE_TEXT } from "@/lib/company-info";

export default async function HomePage() {
  const session = await getSession();
  // Defesa em profundidade: o middleware já protege, mas não renderizamos
  // conteúdo sem sessão.
  if (!session) redirect("/login");

  const firstName = session.fullName.split(" ")[0] || session.fullName;
  const { overall } = await getOverallProgress(session.userId);

  return (
    <AppShell eyebrow="Visão geral" title="Início">
      <div className="space-y-6">
        <WelcomeBanner firstName={firstName} progress={overall} />
        <InstitutionalVideo caption="vídeo institucional · placeholder" />
        <CompanyValues values={COMPANY_VALUES} />
        <CultureCard text={CULTURE_TEXT} />
      </div>
    </AppShell>
  );
}
