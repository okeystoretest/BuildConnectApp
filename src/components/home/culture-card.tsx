export function CultureCard({ text }: { text: string }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-foreground">Nossa cultura</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{text}</p>
    </section>
  );
}
