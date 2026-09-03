import { cn } from "@/lib/utils";

/**
 * Arquivo da marca. É a MESMA arte do favicon: `public/favicon.png` e
 * `public/apple-touch-icon.png` são reduções deste 512×512.
 *
 * Servir o arquivo, em vez de redesenhar a marca em SVG, é o que garante que
 * a aba do navegador, a tela de login e a barra lateral não voltem a divergir.
 */
const BRAND_MARK = "/build-connect-icon.png";

/**
 * Símbolo da Build.Connect: dois losangos entrelaçados como elo de corrente.
 *
 * Aqui havia um SVG desenhado à mão que NÃO era a marca. Duas diferenças:
 *
 *  - O entrelaçamento estava invertido. A máscara cobria a metade superior,
 *    pondo o roxo na frente em cima e o verde na frente embaixo. No arquivo
 *    real é o contrário: verde na frente no cruzamento de cima, roxo na frente
 *    no de baixo.
 *  - A geometria era outra: os centros ficavam a 120px um do outro contra os
 *    ~157px da arte, com losangos menores.
 *
 * O resultado é que a aba do navegador mostrava um logotipo e a aplicação,
 * outro. Retraçar em SVG só recolocaria a divergência a uma distância menor —
 * a arte passa a vir do arquivo.
 */
export function LogoMark({
  className,
  /**
   * `true` quando o símbolo aparece ao lado do nome escrito. Vira decorativo:
   * sem isso o leitor de tela anunciaria "Build.Connect" duas vezes seguidas.
   */
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND_MARK}
      alt={decorative ? "" : "Build.Connect"}
      aria-hidden={decorative || undefined}
      className={cn("shrink-0 object-contain", className)}
    />
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
      <LogoMark className="h-10 w-10" decorative={showText} />
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
