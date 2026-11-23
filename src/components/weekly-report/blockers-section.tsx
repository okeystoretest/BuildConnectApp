"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { excluirBloqueio, salvarBloqueio } from "@/lib/weekly-report/actions";
import type { BlockerItem, WeeklyHealth } from "@/types/weekly-report";
import { HealthSelect } from "./health-select";
import { SectionCard } from "./section-card";

/**
 * Aba 5 — Bloqueios e Decisões.
 *
 * A única seção sem modelo fixo: a planilha trazia cinco linhas vazias
 * numeradas de 1 a 5, o que é o mesmo que nenhuma linha — e um teto de cinco
 * para uma semana ruim.
 *
 * Cada bloqueio salva por conta própria, e não a seção inteira como as de
 * modelo fixo: aqui as linhas nascem e morrem, e um "Salvar" de seção teria
 * de reconciliar criações, edições e exclusões num payload só para gravar o
 * que normalmente é UMA linha.
 */

/** Rascunho local de um bloqueio novo. Vira linha no banco ao salvar. */
interface Rascunho {
  title: string;
  impact: string;
  needs: string;
  dueDate: string;
  health?: WeeklyHealth;
  resolution: string;
}

const VAZIO: Rascunho = {
  title: "",
  impact: "",
  needs: "",
  dueDate: "",
  health: undefined,
  resolution: "",
};

export function BlockersSection({
  slug,
  reportId,
  canEdit,
  blockers,
}: {
  slug: string;
  reportId: string;
  canEdit: boolean;
  blockers: readonly BlockerItem[];
}) {
  const router = useRouter();
  const [novo, setNovo] = useState<Rascunho | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function gravar(id: string | undefined, dados: Rascunho) {
    if (ocupado) return;
    setOcupado(id ?? "novo");
    setErro(null);
    const r = await salvarBloqueio({
      slug,
      reportId,
      blockerId: id,
      title: dados.title,
      impact: dados.impact || null,
      needs: dados.needs || null,
      dueDate: dados.dueDate || null,
      health: dados.health ?? null,
      resolution: dados.resolution || null,
    });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível salvar o bloqueio.");
      return;
    }
    setNovo(null);
    router.refresh();
  }

  async function remover(id: string) {
    if (ocupado) return;
    setOcupado(id);
    setErro(null);
    const r = await excluirBloqueio({ slug, reportId, blockerId: id });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível excluir o bloqueio.");
      return;
    }
    router.refresh();
  }

  return (
    <SectionCard
      title="Bloqueios e decisões"
      description="O que depende de alguém para destravar. É esta lista que vira decisão na reunião de sexta."
      erro={erro}
      footnote={
        canEdit && !novo ? (
          <Button size="sm" variant="secondary" onClick={() => setNovo({ ...VAZIO })}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar bloqueio
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {blockers.length === 0 && !novo && (
          <p className="py-2 text-xs text-muted">
            Nenhum bloqueio registrado nesta semana. Uma semana sem bloqueio é um ótimo relatório
            — só não vale deixar de registrar o que travou.
          </p>
        )}

        {blockers.map((b) => (
          <BlockerRow
            key={b.id}
            blocker={b}
            canEdit={canEdit}
            ocupado={ocupado === b.id}
            onSave={(dados) => gravar(b.id, dados)}
            onDelete={() => remover(b.id)}
          />
        ))}

        {novo && (
          <BlockerRow
            novo
            canEdit={canEdit}
            ocupado={ocupado === "novo"}
            onSave={(dados) => gravar(undefined, dados)}
            onDelete={() => setNovo(null)}
          />
        )}
      </div>
    </SectionCard>
  );
}

function BlockerRow({
  blocker,
  novo,
  canEdit,
  ocupado,
  onSave,
  onDelete,
}: {
  blocker?: BlockerItem;
  novo?: boolean;
  canEdit: boolean;
  ocupado: boolean;
  onSave: (dados: Rascunho) => void;
  onDelete: () => void;
}) {
  const [dados, setDados] = useState<Rascunho>({
    title: blocker?.title ?? "",
    impact: blocker?.impact ?? "",
    needs: blocker?.needs ?? "",
    dueDate: blocker?.dueDate ?? "",
    health: blocker?.health,
    resolution: blocker?.resolution ?? "",
  });

  const alterar = (patch: Partial<Rascunho>) => setDados((d) => ({ ...d, ...patch }));
  const pronto = dados.title.trim().length > 0;

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="grid gap-2 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Input
            aria-label="Bloqueio ou decisão necessária"
            className="h-9 text-xs"
            placeholder="Bloqueio ou decisão necessária"
            disabled={!canEdit}
            value={dados.title}
            onChange={(e) => alterar({ title: e.target.value })}
          />
        </div>
        <div className="lg:col-span-3">
          <Input
            aria-label="Impacto (o que trava)"
            className="h-9 text-xs"
            placeholder="O que trava"
            disabled={!canEdit}
            value={dados.impact}
            onChange={(e) => alterar({ impact: e.target.value })}
          />
        </div>
        <div className="lg:col-span-2">
          <Input
            aria-label="Precisa de quem"
            className="h-9 text-xs"
            placeholder="Precisa de quem"
            disabled={!canEdit}
            value={dados.needs}
            onChange={(e) => alterar({ needs: e.target.value })}
          />
        </div>
        <div className="lg:col-span-2">
          <Input
            aria-label="Prazo"
            type="date"
            className="h-9 text-xs"
            disabled={!canEdit}
            value={dados.dueDate}
            onChange={(e) => alterar({ dueDate: e.target.value })}
          />
        </div>
        <div className="lg:col-span-3">
          <HealthSelect
            ariaLabel="Status do bloqueio"
            value={dados.health}
            disabled={!canEdit}
            onChange={(health) => alterar({ health })}
          />
        </div>
        <div className="lg:col-span-6">
          <Input
            aria-label="Resolução"
            className="h-9 text-xs"
            placeholder="Resolução"
            disabled={!canEdit}
            value={dados.resolution}
            onChange={(e) => alterar({ resolution: e.target.value })}
          />
        </div>
        {canEdit && (
          <div className="flex items-center justify-end gap-1.5 lg:col-span-3">
            <Button size="sm" onClick={() => onSave(dados)} disabled={!pronto || ocupado}>
              {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onDelete}
              disabled={ocupado}
              aria-label={novo ? "Descartar bloqueio" : "Excluir bloqueio"}
              className="h-8 w-8 text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
