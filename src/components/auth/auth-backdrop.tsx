/** Elipses concêntricas sutis atrás do card de login, como no design. */
export function AuthBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[520, 760, 1020, 1320].map((size, index) => (
          <div
            key={size}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-border/40"
            style={{
              width: size,
              height: size * 0.62,
              opacity: 0.5 - index * 0.1,
            }}
          />
        ))}
      </div>
      <div className="absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-accent/[0.06] blur-3xl" />
    </div>
  );
}
