import * as Icons from "lucide-react";
import type { CompanyValue } from "@/types/content";

function Icon({ name }: { name: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Cmp ? <Cmp className="h-4 w-4" /> : null;
}

export function CompanyValues({ values }: { values: readonly CompanyValue[] }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Sobre a empresa</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {values.map((value) => (
          <article key={value.title} className="rounded-xl border border-border bg-surface p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Icon name={value.icon} />
            </span>
            <h4 className="mt-3 text-sm font-semibold text-foreground">{value.title}</h4>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{value.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
