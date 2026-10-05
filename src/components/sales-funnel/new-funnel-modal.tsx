"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarFunil } from "@/lib/sales-funnel/actions";
import { MoneyInput } from "./money-input";

/** Mês corrente em yyyy-mm-01: o recorte natural de um funil novo. */
function mesCorrente(): string {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${hoje.getFullYear()}-${mes}-01`;
}

export function NewFunnelModal({
  slug,
  open,
  onClose,
  onCreated,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [referenceDate, setReferenceDate] = useState(mesCorrente);
  const [goalCents, setGoalCents] = useState<number | null>(null);
  const [ticketCents, setTicketCents] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState("");
  const [diasUteis, setDiasUteis] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Equipe e período NÃO entram aqui: o funil nasce calculável com meta e
  // ticket, e exigir os quatro campos poria uma pergunta de execução na frente
  // de quem só quer ver o número aparecer.
  const pronto =
    name.trim().length > 0 && goalCents !== null && goalCents > 0 && ticketCents !== null && ticketCents > 0;

  function inteiroOuNulo(texto: string): number | null {
    const n = Number.parseInt(texto, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  async function confirmar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await criarFunil({
      slug,
      name,
      referenceDate,
      goalCents,
      ticketCents,
      sellerCount: inteiroOuNulo(vendedores),
      workingDays: inteiroOuNulo(diasUteis),
    });
    setSalvando(false);
    if (!r.ok || !r.id) {
      setErro(r.error ?? "Não foi possível criar o funil.");
      return;
    }
    setName("");
    setGoalCents(null);
    setTicketCents(null);
    setVendedores("");
    setDiasUteis("");
    router.refresh();
    onCreated(r.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo funil de vendas"
      description="A meta e o ticket médio definem quantas conversões o período exige. As etapas vêm com o modelo do canvas e podem ser trocadas depois."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!pronto || salvando}>
            {salvando ? "Criando…" : "Criar funil"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <label htmlFor="funil-nome" className="text-sm font-medium">
            Nome do funil
          </label>
          <Input
            id="funil-nome"
            value={name}
            maxLength={80}
            placeholder="Varejo"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="funil-data" className="text-sm font-medium">
            Período
          </label>
          <Input
            id="funil-data"
            type="date"
            value={referenceDate}
            onChange={(e) => setReferenceDate(e.target.value)}
          />
        </div>

        <MoneyInput id="funil-meta" label="Meta global" cents={goalCents} onChange={setGoalCents} />
        <MoneyInput
          id="funil-ticket"
          label="Ticket médio"
          cents={ticketCents}
          onChange={setTicketCents}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="funil-vendedores" className="text-sm font-medium">
              Vendedores
            </label>
            <Input
              id="funil-vendedores"
              inputMode="numeric"
              value={vendedores}
              placeholder="4"
              className="tabular-nums"
              onChange={(e) => setVendedores(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="funil-dias" className="text-sm font-medium">
              Dias úteis
            </label>
            <Input
              id="funil-dias"
              inputMode="numeric"
              value={diasUteis}
              placeholder="22"
              className="tabular-nums"
              onChange={(e) => setDiasUteis(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          Opcionais. Com os dois, o funil mostra quantas oportunidades cada vendedor precisa abrir
          por dia.
        </p>

        {erro && <p className="text-sm text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
