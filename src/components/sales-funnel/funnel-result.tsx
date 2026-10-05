import { formatarPercentual, formatarReais, formatarVolume } from "@/lib/sales-funnel/format";
import { planoDeAcao } from "@/lib/sales-funnel/plano-de-acao";
import type { Equipe, FunnelResult } from "@/lib/sales-funnel/types";
import { FunnelShape } from "./funnel-shape";
import { DiagnosticsList } from "./diagnostics-list";

/**
 * A faixa de resultado: o funil e os números que ele produz.
 *
 * Fica ABAIXO do formulário e só aparece quando os números fecham. O critério
 * não é inventado aqui — é `erros()`, do motor, a mesma função que decide se
 * dá para calcular. Enquanto ela reprova, `stages` volta vazio e os
 * diagnósticos já trazem, campo a campo, o que falta; esta tela só os lista.
 * Se o critério morasse aqui, existiriam duas respostas para "está
 * preenchido?" — a que mostra o desenho e a que faz a conta — e elas
 * divergiriam no primeiro caso de borda.
 *
 * `topVolume > 0` entra no teste junto com `stages`. No sentido Capacidade →
 * R$ com o campo de prospecções vazio, o motor aprova a entrada (meta, ticket
 * e taxas estão válidos) mas todos os volumes saem zero: haveria etapa na
 * lista e nada para desenhar.
 */
export function FunnelResultPanel({
  resultado,
  /** "meta" destaca conversões necessárias; "capacidade" destaca faturamento. */
  modo,
  /** Sem equipe declarada não há plano de ação — e não há erro. */
  equipe,
}: {
  resultado: FunnelResult;
  modo: "meta" | "capacidade";
  equipe: Equipe | null;
}) {
  const completo = resultado.stages.length > 0 && resultado.topVolume > 0;

  if (!completo) return <PendenciasCard resultado={resultado} modo={modo} />;

  const avisos = resultado.diagnostics.filter((d) => d.severity !== "erro");

  return (
    <section className="rounded-lg border border-border bg-surface-1 p-4">
      <header className="mb-3 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          O funil que a meta exige
        </h3>
      </header>

      {/* O desenho e os números lado a lado. É o que justifica esta faixa
          ocupar a largura inteira: o SVG sozinho é alto e estreito, e deixaria
          dois vãos vazios. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex justify-center">
          <div className="w-full max-w-[820px]">
            <FunnelShape
              stages={resultado.stages}
              channels={resultado.channels}
              conversoes={resultado.requiredConversions}
            />
          </div>
        </div>

        <div className="space-y-2">
          {/* O número que a ferramenta existe para dar, no tamanho que ele
              merece. Saiu da caixinha dentro do bloco ① justamente para ficar
              ao lado do desenho que o explica. */}
          <Destaque
            rotulo={modo === "meta" ? "Precisaria de" : "Renderia"}
            valor={
              modo === "meta"
                ? `${formatarVolume(resultado.requiredConversions)} conversões`
                : formatarReais(resultado.projectedRevenueCents)
            }
          />

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <Numero
              rotulo="Prospecções no topo"
              valor={formatarVolume(resultado.topVolume)}
              nota="O que precisa entrar na boca do funil."
            />
            <Numero
              rotulo="Conversão geral"
              valor={formatarPercentual(resultado.externalRate)}
              nota="Quanto do topo vira negócio fechado."
            />
            <Numero
              rotulo={modo === "meta" ? "Faturamento" : "Conversões"}
              valor={
                modo === "meta"
                  ? formatarReais(resultado.projectedRevenueCents)
                  : formatarVolume(resultado.requiredConversions)
              }
              nota={
                modo === "meta"
                  ? "Conversões × ticket médio."
                  : "O que a capacidade informada fecha."
              }
            />
            <Numero
              rotulo="Cobertura dos canais"
              valor={formatarPercentual(resultado.channelCoverage)}
              nota="Soma das fatias declaradas."
            />
          </div>
        </div>
      </div>

      <PlanoDeAcao resultado={resultado} equipe={equipe} />

      <DiagnosticsList diagnostics={avisos} className="mt-4" />
    </section>
  );
}

/**
 * O que se cobra do vendedor.
 *
 * A metodologia do canvas termina aqui: o vendedor controla as CAUSAS — quantas
 * oportunidades abre, quantas visitas faz — e não o efeito. Uma meta de
 * R$ 75.000 não é acionável; "cinco oportunidades por dia" é.
 *
 * O valor exato acompanha o inteiro de propósito. Uma visita e dois terços por
 * dia arredondada para duas daria 2 × 4 × 22 = 176 visitas contra as 147 que o
 * funil pede, e sem o exato ao lado a conta errada pareceria certa.
 */
function PlanoDeAcao({
  resultado,
  equipe,
}: {
  resultado: FunnelResult;
  equipe: Equipe | null;
}) {
  const esforco = planoDeAcao(resultado, equipe);
  if (!esforco || !equipe) return null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Plano de ação — {equipe.vendedores}{" "}
        {equipe.vendedores === 1 ? "vendedor" : "vendedores"} · {equipe.diasUteis} dias úteis
      </h4>

      <ul className="mt-2 space-y-1">
        {esforco.map((etapa) => (
          <li
            key={etapa.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border/60 pt-1 first:border-0 first:pt-0"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{etapa.label}</span>
            <span className="text-sm tabular-nums">
              <strong className="font-semibold">{formatarVolume(etapa.porVendedor)}</strong>
              <span className="text-muted"> / vendedor</span>
            </span>
            <span className="text-sm tabular-nums">
              <strong className="font-semibold">{formatarVolume(etapa.porVendedorDia)}</strong>
              <span className="text-muted"> / dia</span>
            </span>
            <span className="w-full text-[11px] tabular-nums text-muted sm:w-auto">
              ({etapa.porVendedorExato.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              ·{" "}
              {etapa.porVendedorDiaExato.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              )
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * O lugar do funil, enquanto ele não pode existir.
 *
 * As frases vêm prontas do motor: "Informe a meta global.", "A taxa de
 * «Visita» precisa ficar entre 0 e 100%." Nenhuma redação é montada aqui,
 * pela mesma razão que `DiagnosticsList` não monta — o texto que a pessoa lê
 * tem de ser o texto que o teste do motor verifica.
 */
function PendenciasCard({
  resultado,
  modo,
}: {
  resultado: FunnelResult;
  modo: "meta" | "capacidade";
}) {
  const faltas = resultado.diagnostics.filter((d) => d.severity === "erro");

  return (
    <section className="rounded-lg border border-dashed border-border bg-surface-1 p-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        O funil aparece aqui
      </h3>
      <p className="mt-1 text-sm text-muted">
        Assim que estes campos estiverem preenchidos, o desenho e os números surgem sozinhos e
        passam a recalcular a cada tecla.
      </p>

      {faltas.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {faltas.map((d, i) => (
            <li
              key={`${d.code}-${d.targetId ?? i}`}
              className="flex items-start gap-2 text-sm text-foreground"
            >
              {/* Caixa vazia: a pendência se lê como item de lista de
                  conferência, e não como erro de quem ainda nem terminou de
                  preencher. */}
              <span
                aria-hidden
                className="mt-1 h-3 w-3 shrink-0 rounded-[3px] border border-border bg-surface-3"
              />
              <span className="min-w-0">{d.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        // Sem erro e ainda assim sem desenho: é o Capacidade → R$ com o campo
        // de prospecções vazio. O motor não reprova isso, porque zero é um
        // número legítimo — mas não há funil a desenhar.
        modo === "capacidade" && (
          <ul className="mt-3">
            <li className="flex items-start gap-2 text-sm text-foreground">
              <span
                aria-hidden
                className="mt-1 h-3 w-3 shrink-0 rounded-[3px] border border-border bg-surface-3"
              />
              <span className="min-w-0">Informe quantas prospecções cabem no período.</span>
            </li>
          </ul>
        )
      )}
    </section>
  );
}

function Destaque({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">{rotulo}</p>
      <p className="mt-0.5 text-2xl font-bold leading-tight tabular-nums">{valor}</p>
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">{rotulo}</p>
      <p className="mt-0.5 text-lg font-semibold leading-tight tabular-nums">{valor}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">{nota}</p>
    </div>
  );
}
