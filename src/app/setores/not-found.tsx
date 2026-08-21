import Link from "next/link";
import { Compass } from "lucide-react";

export default function SectorNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
        <Compass className="h-5 w-5" />
      </span>
      <h1 className="text-lg font-semibold text-foreground">Setor não encontrado</h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted">
        O endereço acessado não corresponde a nenhuma área da plataforma.
      </p>
      <Link
        href="/"
        className="focus-ring mt-6 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
