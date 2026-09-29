/**
 * O trilho vertical da borda direita do canvas: ATRAÇÃO, RELACIONAMENTO,
 * FECHAMENTO.
 *
 * Na folha ele agrupa os blocos numerados por MOMENTO da venda — atrair,
 * relacionar, fechar. Aqui cumpre o mesmo papel ao lado da coluna de blocos,
 * e é o que explica por que ① Meta fica embaixo e ③ Taxas em cima: a leitura
 * do canvas sobe, como o cálculo.
 *
 * `aria-hidden` porque é orientação visual redundante — cada bloco já tem
 * título próprio, e um leitor de tela lendo três palavras soltas viradas de
 * lado só atrapalharia.
 */
const FASES = ["Atração", "Relacionamento", "Fechamento"] as const;

export function PhaseRail() {
  return (
    <div aria-hidden className="hidden w-7 shrink-0 flex-col gap-1 xl:flex">
      {FASES.map((fase) => (
        <div
          key={fase}
          className="flex flex-1 items-center justify-center rounded-md border border-border bg-surface-2"
        >
          <span
            className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {fase}
          </span>
        </div>
      ))}
    </div>
  );
}
