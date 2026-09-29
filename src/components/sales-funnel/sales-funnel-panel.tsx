"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import type { SalesFunnelData, SalesFunnelDetail } from "@/types/sales-funnel";
import { FunnelCard } from "./funnel-card";
import { NewFunnelModal } from "./new-funnel-modal";
import { FunnelEditor } from "./funnel-editor";

type Filtro = "ativos" | "todos";

/**
 * A ferramenta Funil de Vendas dentro da aba do setor.
 *
 * Duas telas: a lista de funis e o editor de um deles. Qual está aberta vem
 * da URL (`?funil=`), e não de estado local, porque o DETALHE é carregado no
 * servidor — recarregar a página no meio de uma edição tem de voltar para o
 * mesmo funil.
 */
export function SalesFunnelPanel({
  slug,
  data,
  detail,
  onSelect,
}: {
  slug: string;
  data: SalesFunnelData;
  /** Funil aberto, resolvido no servidor a partir de `?funil=`. */
  detail?: SalesFunnelDetail | null;
  /** Escreve `?funil=` na URL. Null volta para a lista. */
  onSelect: (id: string | null) => void;
}) {
  const [novoAberto, setNovoAberto] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("ativos");

  // Arquivados escondidos por padrão: eles são histórico, e um setor que
  // planeja todo mês acumularia doze cards de ruído por ano.
  const visiveis = useMemo(
    () =>
      filtro === "todos"
        ? data.funnels
        : data.funnels.filter((f) => f.status !== "ARQUIVADO"),
    [data.funnels, filtro],
  );

  const arquivados = data.funnels.length - data.funnels.filter((f) => f.status !== "ARQUIVADO").length;

  if (detail) {
    return (
      <FunnelEditor
        /* A chave é o que garante remontagem ao trocar de funil: todo o
           estado do editor vive em inicializadores de useState, e sem ela
           editar `?funil=` na barra de endereços manteria o formulário do
           funil anterior sobre o id do novo. */
        key={detail.id}
        slug={slug}
        detail={detail}
        canManage={data.canManage}
        onBack={() => onSelect(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Funil de Vendas
          </h2>
          <p className="text-sm text-muted">
            Quantas prospecções o período exige para a meta ser batida.
            {data.inherited && ` Base compartilhada com ${data.scopeLabel}.`}
          </p>
        </div>
        {data.canManage && <Button onClick={() => setNovoAberto(true)}>Novo funil</Button>}
      </div>

      {arquivados > 0 && (
        <Segmented
          options={[
            { value: "ativos", label: "Em uso" },
            { value: "todos", label: `Todos (${data.funnels.length})` },
          ]}
          value={filtro}
          onChange={setFiltro}
          ariaLabel="Filtrar funis por situação"
        />
      )}

      {visiveis.length === 0 ? (
        <EmptyState
          title="Nenhum funil por aqui"
          description={
            data.canManage
              ? "Crie um funil para calcular quantas oportunidades o período exige."
              : "Quando a gestão criar um funil, ele aparece aqui."
          }
          action={
            data.canManage ? (
              <Button onClick={() => setNovoAberto(true)}>Criar o primeiro</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visiveis.map((funnel) => (
            <FunnelCard key={funnel.id} funnel={funnel} onOpen={onSelect} />
          ))}
        </div>
      )}

      <NewFunnelModal
        slug={slug}
        open={novoAberto}
        onClose={() => setNovoAberto(false)}
        onCreated={(id) => {
          setNovoAberto(false);
          onSelect(id);
        }}
      />
    </div>
  );
}
