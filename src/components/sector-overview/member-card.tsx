"use client";

import { useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Download,
  Eye,
  FileText,
  FolderOpen,
  PlayCircle,
  Star,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import {
  groupPending,
  memberStatus,
  type MemberOverview,
  type MemberStatus,
  type PendingContentGroup,
} from "@/lib/sector-overview";
import { fetchPersonnelFolders } from "@/lib/personnel-actions";
import { PersonnelDocumentViewer } from "./personnel-document-viewer";
import { folderStatusLabel } from "@/lib/personnel-expiry";
import type { PersonnelFolderGroup } from "@/types/hr";

/**
 * Média ausente vira travessão. Exibir 0,0 marcaria como péssimo quem apenas
 * ainda não tem nota aprovada.
 */
function averageLabel(average: number | null): string {
  if (average === null) return "—";
  return average.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

const STATUS: Record<MemberStatus, { label: string; tone: "neutral" | "info" | "primary" }> = {
  NAO_INICIADO: { label: "Não iniciado", tone: "neutral" },
  EM_ANDAMENTO: { label: "Em andamento", tone: "info" },
  CONCLUIDO: { label: "Concluído", tone: "primary" },
};

/** Ícone de cada mídia no modal de pendências, pelo nome que o agrupador dá. */
const PENDING_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PlayCircle,
  FileText,
};

/** Um número do card, com o rótulo acima e o ícone identificando o assunto. */
function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold text-foreground", tone)}>{value}</p>
    </div>
  );
}

/**
 * Um dos dois botões do rodapé do card.
 *
 * É um botão desenhado aqui, e não o `Button` comum: os dois precisam do mesmo
 * bloco de rótulo + número grande e de tons próprios — âmbar para o que cobra
 * ação, primário para o que é consulta. Levar isso ao `Button` por `className`
 * acabaria reescrevendo o componente inteiro no ponto de uso, duas vezes.
 *
 * Contagem zero desabilita: abrir um modal para ler "nada aqui" é um clique que
 * a tela já podia ter respondido — e o próprio botão responde.
 */
function CardAction({
  icon,
  label,
  count,
  emptyLabel,
  tone,
  onClick,
  className,
  openWhenEmpty = false,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  emptyLabel: string;
  tone: "warning" | "primary";
  onClick: () => void;
  className?: string;
  /**
   * Abre mesmo com contagem zero. É o caso de Documentos: zero arquivo não é
   * "nada para ver" — é a lista de pastas vazias, que é exatamente o que o
   * gestor foi procurar.
   */
  openWhenEmpty?: boolean;
}) {
  const empty = count === 0;
  const disabled = empty && !openWhenEmpty;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup={disabled ? undefined : "dialog"}
      className={cn(
        "focus-ring flex min-w-0 flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors",
        empty
          ? "border-border bg-surface-2"
          : tone === "warning"
            ? "border-warning/40 bg-warning/10 hover:border-warning/60 hover:bg-warning/20"
            : "border-primary/40 bg-primary/10 hover:border-primary/60 hover:bg-primary/20",
        disabled ? "cursor-default" : empty && "hover:border-border-strong hover:bg-surface-3",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1 text-[10px] uppercase tracking-wide",
          empty ? "text-muted" : tone === "warning" ? "text-warning" : "text-primary",
        )}
      >
        {icon}
        {label}
      </span>
      {empty ? (
        <span className="mt-0.5 truncate text-xs text-muted">{emptyLabel}</span>
      ) : (
        <span
          className={cn(
            "mt-0.5 text-lg font-bold leading-tight",
            tone === "warning" ? "text-warning" : "text-primary",
          )}
        >
          {count}
          {/* O substantivo fica pequeno para o número não perder o peso. */}
          <span className="ml-1 text-[11px] font-medium text-muted">
            {count === 1 ? "item" : "itens"}
          </span>
        </span>
      )}
    </button>
  );
}

/** Lista de pendências de uma mídia, dentro do modal. */
function PendingGroupList({ group }: { group: PendingContentGroup }) {
  const Icon = PENDING_ICON[group.icon];
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            group.tone === "primary" ? "bg-primary/15 text-primary" : "bg-info/15 text-info",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
        </span>
        {group.label}
        <span className="text-muted">({group.items.length})</span>
      </h4>
      <ul className="space-y-1.5 pl-8">
        {group.items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
            <span className="min-w-0">
              <span className="block break-words">{item.title}</span>
              <span className="block text-[11px] text-muted">{item.subsector}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FILE_KIND_STYLE: Record<string, string> = {
  PDF: "bg-danger/15 text-danger",
  DOCX: "bg-info/15 text-info",
  XLSX: "bg-primary/15 text-primary",
  PPTX: "bg-warning/15 text-warning",
};

/**
 * As pastas do Departamento Pessoal de um colaborador, dentro do modal.
 *
 * Pasta vazia aparece, e não é omitida: o que falta é justamente o que o
 * gestor precisa ver — uma lista só do que existe esconderia o ASO que nunca
 * chegou.
 */
function PersonnelFolderList({
  groups,
  canDownload,
  onOpen,
}: {
  groups: readonly PersonnelFolderGroup[];
  canDownload: boolean;
  onOpen: (file: { id: string; name: string }) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.key}>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
            {group.label}
          </h4>
          <ul className="space-y-3">
            {group.folders.map((folder) => (
              <li key={folder.key}>
                <p className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm text-foreground">
                    {folder.label}
                  </span>
                  {/* A palavra, não a cor: "Pendente" e "Vencido" são ambos
                      falta de documento, e o tom não diz qual é qual. */}
                  <span
                    className={cn(
                      "shrink-0 text-[11px] tabular-nums",
                      folder.status === "pendente" || folder.status === "vencido"
                        ? "text-danger"
                        : folder.status === "cuidado"
                          ? "text-warning"
                          : "text-muted",
                    )}
                  >
                    {folderStatusLabel(folder.status, folder.expiresOn, folder.files.length)}
                  </span>
                </p>

                {folder.files.length > 0 && (
                  <ul className="mt-1.5 space-y-1.5">
                    {folder.files.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-2 rounded-lg bg-surface-2 p-2"
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-bold",
                            FILE_KIND_STYLE[file.kind],
                          )}
                        >
                          {file.kind}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-foreground">
                            {file.name}
                          </span>
                          <span className="block text-[11px] tabular-nums text-muted">
                            {file.size}
                          </span>
                        </span>
                        {/* Abre DENTRO da plataforma, como imagem com marca
                            d'água — nunca um link para o arquivo. Office não
                            rasteriza, e o visualizador responde isso. */}
                        <button
                          type="button"
                          onClick={() => onOpen({ id: file.id, name: file.name })}
                          aria-label={`Visualizar ${file.name}`}
                          className="focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-3 text-foreground transition-colors hover:bg-surface"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canDownload && (
                          <a
                            href={file.filePath}
                            download
                            aria-label={`Baixar ${file.name}`}
                            className="focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary transition-colors hover:bg-primary/25"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function MemberCard({
  member,
  canSeeDocuments,
}: {
  member: MemberOverview;
  /**
   * Quem OLHA alcança a documentação da equipe? Admin sempre; Gestor só com a
   * permissão marcada no cadastro. Vem da página porque é do VISITANTE, não do
   * colaborador do card — e o servidor confere de novo em cada leitura.
   */
  canSeeDocuments: boolean;
}) {
  const [pendingModal, setPendingModal] = useState(false);
  const [evaluationsModal, setEvaluationsModal] = useState(false);
  const [documentsModal, setDocumentsModal] = useState(false);
  // As pastas chegam só quando o modal abre — ver `fetchPersonnelFolders`.
  // `null` é "ainda não buscado"; o erro é texto porque o servidor é quem
  // decide se este gestor alcança esta pessoa, e a recusa é para ser lida.
  const [folders, setFolders] = useState<readonly PersonnelFolderGroup[] | null>(null);
  const [canDownload, setCanDownload] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null);
  const status = STATUS[memberStatus(member.doneItems, member.totalItems)];

  function openDocuments() {
    setDocumentsModal(true);
    if (folders || foldersError) return; // já buscado: o acervo não muda à toa.
    void fetchPersonnelFolders(member.userId).then((res) => {
      if (res.ok && res.groups) {
        setFolders(res.groups);
        setCanDownload(Boolean(res.canDownload));
      } else {
        setFoldersError(res.error ?? "Falha ao carregar a documentação.");
      }
    });
  }

  const pendingGroups = groupPending(member.pendingList);
  // Um número só no botão: para o gestor as duas listas são "o que já foi
  // avaliado nesta pessoa", e separá-las no rótulo pediria dois botões.
  const evaluationCount = member.evaluations.length + member.performance.length;

  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface p-4">
      <header className="flex items-start gap-3">
        <Avatar
          name={member.name}
          avatarPath={member.avatarPath}
          size="h-11 w-11"
          textSize="text-sm"
        />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-foreground">{member.name}</h4>
          {/* O cadastro não guarda cargo; o papel é o que existe. */}
          <p className="truncate text-xs text-muted">{member.role}</p>
        </div>
        <Badge tone={status.tone} className="shrink-0">
          {status.label}
        </Badge>
      </header>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted">Progresso</span>
          <span className="text-sm font-semibold text-foreground">{member.progress}%</span>
        </div>
        <Progress
          value={member.progress}
          className="mt-1.5"
          label={`Progresso de ${member.name}`}
        />
        <p className="mt-1.5 text-[11px] text-muted">
          {member.doneItems} de {member.totalItems} itens concluídos
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
        <Metric
          icon={<CalendarDays className="h-3 w-3" />}
          label="Cadastro"
          value={member.sinceLabel}
        />
        <Metric
          icon={<Star className="h-3 w-3" />}
          label="Média"
          value={member.average === null ? "—" : `${averageLabel(member.average)}/10`}
        />
        <Metric
          icon={<TriangleAlert className="h-3 w-3" />}
          label="Reprovações"
          value={String(member.rejections)}
          tone={member.rejections > 0 ? "text-warning" : undefined}
        />
      </div>

      {/* Os dois botões, lado a lado e colados na base: numa grade, cards de
          alturas diferentes com o rodapé alinhado leem-se como uma lista.
          Ambas as consultas abrem em modal — o gestor não perde a página, a
          rolagem nem a busca que digitou para chegar até aqui. */}
      <div className="mt-3 flex flex-1 flex-col justify-end">
        <div className="grid grid-cols-2 gap-2">
          <CardAction
            icon={<TriangleAlert className="h-3 w-3" />}
            label="Pendências"
            count={member.pending}
            emptyLabel="Conteúdo em dia"
            tone="warning"
            onClick={() => setPendingModal(true)}
          />
          <CardAction
            icon={<ClipboardList className="h-3 w-3" />}
            label="Avaliações"
            count={evaluationCount}
            emptyLabel="Nenhuma ainda"
            tone="primary"
            onClick={() => setEvaluationsModal(true)}
          />
          {/* Documentos ocupa a linha inteira: numa grade de três, "Pendências"
              e "Avaliações" quebram em duas linhas e desalinham os números. */}
          {canSeeDocuments && (
          <CardAction
            icon={<FolderOpen className="h-3 w-3" />}
            label="Documentos"
            count={member.personnelFiles}
            emptyLabel="Nenhum arquivado"
            tone="primary"
            onClick={openDocuments}
            className="col-span-2"
            openWhenEmpty
          />
          )}
        </div>
      </div>

      {/* Pendências: o que falta consumir, agrupado por tipo de mídia. */}
      <Modal
        open={pendingModal}
        onClose={() => setPendingModal(false)}
        title="Conteúdos pendentes"
        description={`${member.name} · ${member.pending} ${member.pending === 1 ? "item" : "itens"} a concluir`}
        className="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setPendingModal(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        <div className="scrollbar-slim max-h-[60vh] space-y-5 overflow-y-auto p-6">
          {pendingGroups.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma pendência.</p>
          ) : (
            pendingGroups.map((group) => <PendingGroupList key={group.label} group={group} />)
          )}
        </div>
      </Modal>

      {/* Documentos: as pastas do Departamento Pessoal da pessoa. O arquivo em
          si é alcançado pela mesma régua no servidor — ver `canReadPersonnelOf`
          e a rota /uploads. Baixar é só do DHO e do Admin. */}
      <Modal
        open={documentsModal}
        onClose={() => setDocumentsModal(false)}
        title="Documentos"
        description={`${member.name} · ${member.personnelFiles} ${
          member.personnelFiles === 1 ? "documento arquivado" : "documentos arquivados"
        }`}
        className="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setDocumentsModal(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        <div className="scrollbar-slim max-h-[60vh] space-y-6 overflow-y-auto p-6">
          {foldersError ? (
            <p className="text-sm text-danger">{foldersError}</p>
          ) : folders === null ? (
            <p className="text-sm text-muted">Carregando a documentação…</p>
          ) : folders.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma pasta criada para este colaborador.</p>
          ) : (
            <>
              <PersonnelFolderList
                groups={folders}
                canDownload={canDownload}
                onOpen={setViewing}
              />
              {!canDownload && (
                <p className="border-t border-border pt-4 text-[11px] text-muted">
                  O documento abre aqui dentro, como imagem com marca d&apos;água no seu
                  nome. O arquivo original é do Departamento Pessoal.
                </p>
              )}
            </>
          )}
        </div>
      </Modal>

      <PersonnelDocumentViewer file={viewing} onClose={() => setViewing(null)} />

      {/* Avaliações: notas de compreensão de vídeo e avaliações de desempenho. */}
      <Modal
        open={evaluationsModal}
        onClose={() => setEvaluationsModal(false)}
        title="Avaliações"
        description={`${member.name} · ${evaluationCount} ${evaluationCount === 1 ? "registro" : "registros"}`}
        className="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setEvaluationsModal(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        <div className="scrollbar-slim max-h-[60vh] space-y-6 overflow-y-auto p-6">
          {member.evaluations.length > 0 && (
            <section>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Compreensão de vídeo
              </h4>
              <ul className="space-y-2">
                {member.evaluations.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block break-words text-sm text-foreground">
                        {entry.videoTitle}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {entry.gradedAtLabel}
                        {/* Só a partir da 2ª: marcar "tentativa 1" em todo
                            registro seria ruído. */}
                        {entry.attempt > 1 && ` · tentativa ${entry.attempt}`}
                      </span>
                    </span>
                    {/* Cor nunca sozinha: a palavra vai junto do número. */}
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold",
                        entry.passed ? "text-foreground" : "text-warning",
                      )}
                    >
                      {entry.grade}/10
                      <span className="ml-1 text-[10px] font-normal">
                        {entry.passed ? "aprovada" : "reprovada"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {member.performance.length > 0 && (
            <section>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Desempenho
              </h4>
              <ul className="space-y-2">
                {member.performance.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block break-words text-sm text-foreground">
                        {entry.title}
                        {entry.cycleLabel && (
                          <span className="text-muted"> · {entry.cycleLabel}</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {entry.createdAtLabel} ·{" "}
                        {/* Autoavaliação sai marcada: a nota que a pessoa deu a
                            si mesma não pode ser lida como a do gestor. */}
                        {entry.selfAssessment ? "autoavaliação" : entry.evaluatorName}
                      </span>
                    </span>
                    {entry.total !== null && (
                      <span className="shrink-0 text-xs font-semibold text-foreground">
                        {entry.total}
                        {entry.maxTotal !== null && (
                          <span className="font-normal text-muted">/{entry.maxTotal}</span>
                        )}
                        <span className="ml-1 text-[10px] font-normal text-muted">pontos</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {evaluationCount === 0 && <p className="text-sm text-muted">Nenhuma avaliação ainda.</p>}
        </div>
      </Modal>
    </article>
  );
}
