import { LogoMark } from "@/components/layout/logo";
import { AuthBackdrop } from "@/components/auth/auth-backdrop";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <AuthBackdrop />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="mb-4 h-14 w-14" />
          <p className="text-2xl font-bold tracking-tight">
            <span className="text-foreground">Build.</span>
            <span className="text-primary">Connect</span>
          </p>
          <p className="mt-1.5 text-xs text-muted">Plataforma de integração e conhecimento</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold text-foreground">Entrar</h1>
          <p className="mb-5 mt-0.5 text-xs text-muted">Acesse sua conta corporativa</p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-[11px] text-muted">
          © 2026 Build.Connect · Ambiente corporativo
        </p>
      </div>
    </div>
  );
}
