import { cn, initials } from "@/lib/utils";

export interface AvatarProps {
  /** Nome completo: vira as iniciais quando não há foto. */
  name: string;
  /** Caminho público da foto já tratada (.webp). Ausente = iniciais. */
  avatarPath?: string | null;
  /** Classes de tamanho, sempre em par (ex.: "h-9 w-9"). */
  size?: string;
  /** Tamanho do texto das iniciais, que não acompanha o diâmetro sozinho. */
  textSize?: string;
  /**
   * Como as iniciais são pintadas quando não há foto. "solid" é o disco cheio
   * da barra lateral e do cronograma; "soft" é o disco esmaecido das listas,
   * onde vários avatares juntos em cor cheia viram um vitral.
   */
  tone?: "soft" | "solid";
  className?: string;
}

const TONES = {
  soft: "bg-primary/20 text-primary",
  solid: "bg-primary text-primary-foreground",
} as const;

/**
 * Foto do usuário, com as iniciais como reserva.
 *
 * Existia em quatro lugares com quatro diâmetros e dois tons de fundo
 * diferentes — o mesmo elemento, a mesma regra ("tem foto? mostra; não tem?
 * iniciais"), escrito de novo a cada tela. Agora é um só.
 *
 * `alt` vazio de propósito quando há foto: o nome da pessoa está sempre
 * escrito ao lado, e um leitor de tela que anuncia "Ana Silva, Ana Silva"
 * atrapalha mais do que ajuda.
 */
export function Avatar({
  name,
  avatarPath,
  size = "h-9 w-9",
  textSize = "text-xs",
  tone = "soft",
  className,
}: AvatarProps) {
  if (avatarPath) {
    return (
      <span
        className={cn(
          size,
          "shrink-0 overflow-hidden rounded-full border border-border",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarPath} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        size,
        textSize,
        TONES[tone],
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
