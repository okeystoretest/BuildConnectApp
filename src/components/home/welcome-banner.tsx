import { Progress } from "@/components/ui/progress";

export interface WelcomeBannerProps {
  firstName: string;
  progress: number;
}

export function WelcomeBanner({ firstName, progress }: WelcomeBannerProps) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Boas-vindas, {firstName}
        </h2>
        <p className="mt-1 text-sm text-muted">Continue sua jornada de integração na empresa.</p>
      </div>

      <div className="w-full shrink-0 sm:w-56">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">Progresso geral</span>
          <span className="font-semibold text-primary">{progress}%</span>
        </div>
        <Progress value={progress} label="Progresso geral" />
      </div>
    </section>
  );
}
