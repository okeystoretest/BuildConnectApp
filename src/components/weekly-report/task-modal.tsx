"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { salvarTarefa } from "@/lib/weekly-report/actions";
import { TASK_CATEGORIES } from "@/lib/weekly-report/math";
import { TASK_CATEGORY_LABEL, TASK_PRIORITY_LABEL } from "@/lib/weekly-report/labels";
import { EvidenceField } from "./evidence-field";
import type {
  MarketingTaskCategory,
  MarketingTaskItem,
  MarketingTaskPriority,
  TaskPerson,
} from "@/types/weekly-report";

/** Cadastro e edição de um cartão do quadro. */
export function TaskModal({
  slug,
  open,
  task,
  people,
  onClose,
}: {
  slug: string;
  open: boolean;
  /** Ausente = cartão novo. */
  task?: MarketingTaskItem | null;
  /** Quem pode ser responsável: a gente lotada neste subsetor. */
  people: readonly TaskPerson[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(task?.title ?? "");
  const [category, setCategory] = useState<MarketingTaskCategory>(task?.category ?? "CONTEUDO");
  const [priority, setPriority] = useState<MarketingTaskPriority>(task?.priority ?? "MEDIA");
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [evidence, setEvidence] = useState(task?.evidence ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (salvando || !title.trim()) return;
    setSalvando(true);
    setErro(null);
    const r = await salvarTarefa({
      slug,
      taskId: task?.id,
      title,
      category,
      priority,
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      evidence: evidence || null,
      note: note || null,
    });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível salvar a tarefa.");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={salvando ? undefined : onClose}
      title={task ? `Editar ${task.code}` : "Nova tarefa"}
      description={
        task
          ? undefined
          : "O cartão entra no Backlog. O código é gerado pelo quadro, na sequência."
      }
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando || !title.trim()}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      }
    >
      <div className="space-y-3 p-6">
        <div className="space-y-1.5">
          <Label htmlFor="tarefa-titulo">Tarefa</Label>
          <Input
            id="tarefa-titulo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="O que precisa ser feito"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-categoria">Categoria</Label>
            <Select
              id="tarefa-categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value as MarketingTaskCategory)}
              options={TASK_CATEGORIES.map((c) => ({
                value: c,
                label: TASK_CATEGORY_LABEL[c],
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-prioridade">Prioridade</Label>
            <Select
              id="tarefa-prioridade"
              value={priority}
              onChange={(e) => setPriority(e.target.value as MarketingTaskPriority)}
              options={(["ALTA", "MEDIA", "BAIXA"] as const).map((p) => ({
                value: p,
                label: TASK_PRIORITY_LABEL[p],
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-responsavel">Responsável</Label>
            <Select
              id="tarefa-responsavel"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              options={[
                { value: "", label: "Sem responsável" },
                ...people.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-prazo">Prazo</Label>
            <Input
              id="tarefa-prazo"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tarefa-evidencia">Evidência</Label>
          <EvidenceField
            id="tarefa-evidencia"
            slug={slug}
            value={evidence}
            onChange={setEvidence}
          />
          <p className="text-[11px] text-muted">
            Obrigatória para mover o cartão para Publicado.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tarefa-observacao">Observação</Label>
          <Textarea
            id="tarefa-observacao"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {erro && <p className="text-xs text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
