import { cn } from "@/lib/utils";

/** Cores literais da marca — não seguem o tema. */
const BRAND_PURPLE = "#4A2E74";
const BRAND_GREEN = "#5FB881";

/**
 * Marca da Build.Connect: dois losangos entrelaçados.
 * O roxo passa por cima na metade superior; o verde, na inferior.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Build.Connect"
    >
      <defs>
        <mask id="bc-logo-top">
          <rect width="512" height="512" fill="black" />
          <rect width="512" height="256" fill="white" />
        </mask>
      </defs>
      <g fill="none" strokeWidth="62" strokeLinejoin="round">
        <rect
          x="-80"
          y="-80"
          width="160"
          height="160"
          transform="translate(196 256) rotate(45)"
          stroke={BRAND_PURPLE}
        />
        <rect
          x="-80"
          y="-80"
          width="160"
          height="160"
          transform="translate(316 256) rotate(45)"
          stroke={BRAND_GREEN}
        />
        <g mask="url(#bc-logo-top)">
          <rect
            x="-80"
            y="-80"
            width="160"
            height="160"
            transform="translate(196 256) rotate(45)"
            stroke={BRAND_PURPLE}
          />
        </g>
      </g>
    </svg>
  );
}

export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-10 w-10" />
      {showText && (
        <div className="leading-none">
          <span className="text-[17px] font-bold tracking-tight text-foreground">Build.</span>
          <span className="text-[17px] font-bold tracking-tight text-primary">Connect</span>
          <p className="mt-1 text-[11px] font-medium text-muted">Hub de Onboarding</p>
        </div>
      )}
    </div>
  );
}
