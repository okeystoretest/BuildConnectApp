"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarCenario } from "@/lib/sales-funnel/actions";
import { compararCenario } from "@/lib/sales-funnel/scenario";
import { formatarReais, formatarVolume } from "@/lib/sales-funnel/format";
import type { FunnelInput, ScenarioInput } from "@/lib/sales-funnel/types";
import type { FunnelScenarioItem } from "@/types/sales-funnel";

/**
 * As três alavancas do bloco 5, num formulário.
 *
 * Colaborador ABRE e mexe — a simulação roda no cliente e é a parte que
 * ensina. O que ele não faz é salvar; o botão nem aparece, e o texto explica
 * por quê em vez de deixar a pessoa descobrir no erro.
 */
export function ScenarioModal({
  slug,
  funnelId,
  open,
  cenario,
  etapas,
  plano,
  canManage,
  onClose,
}: {
  slug: string;
  funnelId: string;
  open: boolean;
  /** Null = criando um cenário novo. */
  cenario: FunnelScenarioItem | null;
  etapas: readonly { id: string; label: string; rate: number }[];
  plano: FunnelInput;
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [ticketPercent, setTicketPercent] = useState("0");
  const [taxas, setTaxas] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Recarrega o formulário sempre que o modal abre, para não mostrar os
  // valores do cenário anterior.
  useEffect(() => {
    if (!open) return;
    setName(cenario?.name ?? "");
    setNotes(cenario?.notes ?? "");
    setTicketPercent(String(cenario?.ticketPercent ?? 0));
    setTaxas(
      Object.fromEntries(Object.entries(cenario?.rates ?? {}).map(([k, v]) => [k, String(v)])),
    );
    setErro(null);
  }, [open, cenario]);

  const previa = useMemo(() => {
    const rates = new Map<string, number>();
    for (const [stageId, texto] of Object.entries(taxas)) {
      const valor = Number(texto.replace(",", "."));
      if (texto.trim().length > 0 && valor > 0 && valor <= 100) rates.set(stageId, valor);
    }
    const entrada: ScenarioInput = {
      id: cenario?.id ?? "previa",
      name: name || "Cenário",
      ticketPercent: Number(ticketPercent.replace(",", ".")) || 0,
      topPercent: 0,
      rates,
    };
    return { comparacao: compararCenario(plano, entrada), rates };
  }, [taxas, ticketPercent, name, plano, cenario?.id]);

  const { comparacao } = previa;
  const erroDoCenario = comparacao.cenario.diagnostics.find((d) => d.severity === "erro");

  async function confirmar() {
    if (!canManage || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await salvarCenario({
      slug,
      funnelId,
      scenarioId: cenario?.id,
      name,
      notes: notes.trim() || undefined,
      ticketPercent: Number(ticketPercent.replace(",", ".")) || 0,
      topPercent: 0,
      rates: [...previa.rates.entries()].map(([stageId, rate]) => ({ stageId, rate })),
    });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível salvar o cenário.");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cenario ? "Editar cenário" : "Novo cenário"}
      description="Mexa nas alavancas e veja o efeito antes de salvar. O que você não preencher segue igual ao plano."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            {canManage ? "Cancelar" : "Fechar"}
          </Button>
          {canManage && (
            <Button onClick={confirmar} disabled={salvando || name.trim().length === 0}>
              {salvando ? "Salvando…" : "Salvar cenário"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {!canManage && (
          <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            Simule à vontade. Só Gestor ou Admin guarda o cenário no funil.
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="cen-nome" className="text-sm font-medium">
            Nome do cenário
          </label>
          <Input
            id="cen-nome"
            value={name}
            maxLength={60}
            placeholder="+10% no ticket"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="cen-ticket" className="text-sm font-medium">
            Ticket médio
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="cen-ticket"
              inputMode="decimal"
              className="w-28"
              value={ticketPercent}
              onChange={(e) => setTicketPercent(e.target.value)}
            />
            <span className="text-sm text-muted">% em relação ao plano</span>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Taxas internas</span>
          {etapas.map((etapa) => (
            <div key={etapa.id} className="flex items-center gap-2">
              <label htmlFor={`cen-taxa-${etapa.id}`} className="min-w-0 flex-1 truncate text-sm">
                {etapa.label}
              </label>
              <Input
                id={`cen-taxa-${etapa.id}`}
                inputMode="decimal"
                className="w-24"
                // O placeholder é a taxa do PLANO: deixa claro o que se herda
                // ao não preencher.
                placeholder={String(etapa.rate)}
                value={taxas[etapa.id] ?? ""}
                onChange={(e) => setTaxas((t) => ({ ...t, [etapa.id]: e.target.value }))}
              />
              <span className="text-sm text-muted">%</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <label htmlFor="cen-obs" className="text-sm font-medium">
            Observação
          </label>
          <Textarea
            id="cen-obs"
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <h4 className="text-sm font-semibold">Efeito</h4>
          {erroDoCenario ? (
            <p className="mt-1 text-sm text-danger">{erroDoCenario.message}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {formatarVolume(comparacao.cenario.requiredConversions)} conversões (plano:{" "}
              {formatarVolume(comparacao.plano.requiredConversions)}) ·{" "}
              {formatarVolume(comparacao.cenario.topVolume)} prospecções (plano:{" "}
              {formatarVolume(comparacao.plano.topVolume)}) ·{" "}
              {formatarReais(comparacao.cenario.projectedRevenueCents)}
            </p>
          )}
        </div>

        {erro && <p className="text-sm text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
