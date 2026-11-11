"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleSlash,
  Copy,
  FileText,
  Film,
  History,
  ListChecks,
  PlayCircle,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useCardListLimit } from "@/components/ui/use-card-list-limit";
import { useToast } from "@/providers/toast-provider";
import { useUploadProgress } from "@/lib/use-upload-progress";
import { IntegrationQuestionsModal } from "./integration-questions-modal";
import {
  createIntegrationAsset,
  createIntegrationGuest,
  deleteIntegrationAsset,
  fetchGuestAttempts,
  restoreIntegrationGuest,
  revokeIntegrationGuest,
} from "@/lib/integration/admin-actions";
import type {
  GuestAttemptDetail,
  GuestCard,
  IntegrationAdminData,
  IntegrationAssetRow,
} from "@/types/integration";

export interface IntegrationPagePanelProps {
  data: IntegrationAdminData;
}

const KIND_LABEL = {
  FILME: "Filme da trilha",
  VIDEO: "Vídeo complementar",
  DOCUMENTO: "Documento",
} as const;

/**
 * Quadro "Página de Integração" no DHO.
 *
 * Três colunas, no mesmo desenho da Central de Denúncias e do quadro de
 * chamados — quem já trata chamado não precisa aprender outra tela:
 *
 *   1. Filmes e materiais — o conteúdo que o convidado vai ver.
 *   2. Convidados pendentes — não entraram, não terminaram, ou erraram e
 *      ainda não refizeram.
 *   3. Concluídos — terminaram a trilha com aproveitamento. O card abre o
 *      detalhe de tudo que foi respondido.
 *
 * Sem arrastar entre colunas, de propósito: a coluna é CONSEQUÊNCIA do que o
 * convidado respondeu, não um estado que alguém escolhe. Arrastar sugeriria
 * que o DHO pode dar alguém por concluído sem o questionário.
 */
export function IntegrationPagePanel({ data }: IntegrationPagePanelProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assetModal, setAssetModal] = useState(false);
  const [uploadFor, setUploadFor] = useState<IntegrationAssetRow | null>(null);
  const [questionsFor, setQuestionsFor] = useState<IntegrationAssetRow | null>(null);
  const [detail, setDetail] = useState<{ name: string; rows: GuestAttemptDetail[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const films = data.assets.filter((a) => a.kind === "FILME");
  const extras = data.assets.filter((a) => a.kind !== "FILME");
  const pending = data.guests.filter((g) => g.column === "PENDENTE");
  const concluded = data.guests.filter((g) => g.column === "CONCLUIDO");
  // Quem concluiu ha mais de 15 minutos sai da frente e fica no historico.
  const history = data.guests.filter((g) => g.column === "HISTORICO");

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/integracao/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      error("Não foi possível copiar o link.");
    }
  }

  async function openDetail(guest: GuestCard) {
    setLoadingDetail(guest.id);
    const rows = await fetchGuestAttempts(guest.id);
    setLoadingDetail(null);
    setDetail({ name: guest.fullName, rows });
  }

  async function toggleAccess(guest: GuestCard) {
    const res = guest.revoked
      ? await restoreIntegrationGuest(guest.id)
      : await revokeIntegrationGuest(guest.id);
    if (res.ok) {
      success(guest.revoked ? "Acesso reaberto" : "Acesso revogado");
      router.refresh();
    } else {
      error(res.error ?? "Não foi possível alterar o acesso.");
    }
  }

  function guestCard(guest: GuestCard, clickable: boolean) {
    const body = (
      <>
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold text-foreground">{guest.fullName}</p>
          {guest.revoked ? (
            <Badge tone="neutral">Encerrado</Badge>
          ) : !guest.confirmed ? (
            <Badge tone="warning">Não entrou</Badge>
          ) : null}
        </div>

        <p className="mt-1 text-xs text-muted">
          {guest.approvedCount} de {guest.filmCount} filmes · convidado em {guest.invitedAtLabel}
        </p>

        {guest.failedCount > 0 && (
          <p className="mt-1 text-xs text-warning">
            {guest.failedCount} tentativa(s) abaixo da nota
          </p>
        )}
        {guest.phone === null && (
          <p className="mt-1 text-xs text-muted">Sem telefone — não recebe cobrança.</p>
        )}
      </>
    );

    return (
      <li key={guest.id} className="rounded-xl border border-border bg-surface p-4">
        {clickable ? (
          <button
            type="button"
            onClick={() => void openDetail(guest)}
            disabled={loadingDetail === guest.id}
            className="focus-ring block w-full text-left"
          >
            {body}
            <span className="mt-2 block text-xs font-medium text-primary">
              {loadingDetail === guest.id ? "Abrindo…" : "Ver respostas"}
            </span>
          </button>
        ) : (
          body
        )}

        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {!guest.revoked && (
            <Button variant="secondary" onClick={() => void copyLink(guest.token)}>
              {copied === guest.token ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied === guest.token ? "Copiado" : "Copiar convite"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => void toggleAccess(guest)}>
            {guest.revoked ? <RotateCcw className="h-4 w-4" /> : <CircleSlash className="h-4 w-4" />}
            {guest.revoked ? "Reabrir" : "Revogar"}
          </Button>
          {guest.column === "CONCLUIDO" && !clickable && (
            <Button variant="ghost" onClick={() => void openDetail(guest)}>
              Ver respostas
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Módulo isolado: o convidado entra só pelo convite e não alcança o resto do sistema.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" />
            Histórico
            {history.length > 0 && <span className="text-muted">({history.length})</span>}
          </Button>
          <Button variant="secondary" onClick={() => setAssetModal(true)}>
            <Plus className="h-4 w-4" />
            Adicionar material
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Novo convite
          </Button>
        </div>
      </div>

      {/* Mesma escada do quadro de chamados: uma coluna no celular, duas no
          tablet, as tres lado a lado no monitor. A aba inteira entra em modo
          largo (ver hr-sector-view), que e o que da espaco para elas. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <BoardColumn
          title="Filmes e materiais"
          count={data.assets.length}
          empty="Nada publicado ainda."
        >
          {[...films, ...extras].map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onUpload={() => setUploadFor(asset)}
              onEditQuestions={() => setQuestionsFor(asset)}
              onChanged={() => router.refresh()}
            />
          ))}
        </BoardColumn>

        <BoardColumn title="Pendentes" count={pending.length} empty="Ninguém pendente.">
          {pending.map((g) => guestCard(g, false))}
        </BoardColumn>

        <BoardColumn
          title="Concluídos"
          count={concluded.length}
          empty="Ninguém concluiu nos últimos 15 minutos. Veja o histórico."
        >
          {concluded.map((g) => guestCard(g, true))}
        </BoardColumn>
      </div>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Histórico de concluídos"
        description="Quem terminou a trilha. O card sai da coluna 15 minutos depois de concluir e fica aqui."
        className="max-w-2xl"
      >
        {history.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">
            Ninguém concluiu a trilha ainda.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{g.fullName}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Concluiu em {g.completedAtLabel} · {g.approvedCount} de {g.filmCount} filmes
                    {g.failedCount > 0 && ` · ${g.failedCount} tentativa(s) abaixo da nota`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {g.revoked && <Badge tone="neutral">Encerrado</Badge>}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setHistoryOpen(false);
                      void openDetail(g);
                    }}
                  >
                    Ver respostas
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false);
            router.refresh();
          }}
        />
      )}

      {assetModal && (
        <AssetModal
          onClose={() => setAssetModal(false)}
          onCreated={() => {
            setAssetModal(false);
            router.refresh();
          }}
        />
      )}

      {questionsFor && (
        <IntegrationQuestionsModal
          assetId={questionsFor.id}
          filmTitle={questionsFor.title}
          onClose={() => setQuestionsFor(null)}
          onSaved={() => {
            setQuestionsFor(null);
            router.refresh();
          }}
        />
      )}

      {uploadFor && (
        <UploadModal
          asset={uploadFor}
          onClose={() => setUploadFor(null)}
          onUploaded={() => {
            setUploadFor(null);
            router.refresh();
          }}
        />
      )}

      {detail && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={`Respostas — ${detail.name}`}
          className="max-w-2xl"
        >
          <div className="scrollbar-slim max-h-[70vh] space-y-6 overflow-y-auto p-6">
            {detail.rows.length === 0 && (
              <p className="text-sm text-muted">Nenhuma resposta enviada.</p>
            )}
            {detail.rows.map((attempt) => (
              <div key={attempt.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{attempt.filmTitle}</p>
                  <Badge tone={attempt.passed ? "accent" : "warning"}>
                    Nota {attempt.scoreLabel}
                  </Badge>
                </div>
                <p className="mb-2 text-xs text-muted">Enviado em {attempt.submittedAtLabel}</p>

                <dl className="space-y-2.5">
                  {attempt.answers.map((answer, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg border p-3",
                        answer.correct
                          ? "border-border bg-surface-2"
                          : "border-warning/30 bg-warning/10",
                      )}
                    >
                      <dt className="text-xs leading-relaxed text-muted">{answer.question}</dt>
                      <dd className="mt-1 text-[13px] font-medium text-foreground">
                        {answer.answer}
                      </dd>
                      {!answer.correct && (
                        <dd className="mt-1 text-xs text-muted">
                          Esperado: {answer.expected}
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Um material na coluna 1. */
/** Cards a vista por coluna antes de a propria coluna rolar. */
const VISIBLE_CARDS = 4;

/**
 * Uma coluna do quadro. Existe para o limite de cards nao ser escrito tres
 * vezes, e porque o hook de medicao precisa de uma chamada por coluna.
 */
function BoardColumn({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  const { ref, maxHeight } = useCardListLimit<HTMLUListElement>(VISIBLE_CARDS, count);

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface-2 p-3">
      <header className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted">{count}</span>
      </header>

      {count === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
          {empty}
        </p>
      ) : (
        <ul
          ref={ref}
          className="scrollbar-slim flex-1 space-y-2 overflow-y-auto pr-0.5"
          style={maxHeight !== undefined ? { maxHeight } : undefined}
        >
          {children}
        </ul>
      )}
    </section>
  );
}

function AssetCard({
  asset,
  onUpload,
  onEditQuestions,
  onChanged,
}: {
  asset: IntegrationAssetRow;
  onUpload: () => void;
  onEditQuestions: () => void;
  onChanged: () => void;
}) {
  const { success, error } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [removing, startRemoving] = useTransition();

  function remove() {
    startRemoving(async () => {
      const res = await deleteIntegrationAsset(asset.id);
      if (res.ok) {
        setConfirming(false);
        success("Item excluído");
        onChanged();
      } else {
        error(res.error ?? "Não foi possível excluir.");
      }
    });
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {asset.kind === "DOCUMENTO" ? (
            <FileText className="h-4 w-4" />
          ) : asset.kind === "VIDEO" ? (
            <PlayCircle className="h-4 w-4" />
          ) : (
            <Film className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {asset.kind === "FILME" && <span className="text-muted">{asset.order}. </span>}
            {asset.title}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {asset.kind === "FILME"
              ? `${asset.questionCount} pergunta(s)`
              : KIND_LABEL[asset.kind]}
            {asset.kind === "FILME" && !asset.hasCover && " · sem capa"}
          </p>
        </div>
        {!asset.hasFile && <Badge tone="warning">Sem arquivo</Badge>}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2 border-t border-border pt-2.5">
        <Button variant="secondary" onClick={onUpload}>
          <Upload className="h-4 w-4" />
          {asset.hasFile ? "Substituir" : "Enviar"}
        </Button>
        {asset.kind === "FILME" && (
          <Button variant="secondary" onClick={onEditQuestions}>
            <ListChecks className="h-4 w-4" />
            Perguntas
          </Button>
        )}
        <Button variant="ghost" onClick={() => setConfirming(true)} aria-label="Excluir">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Modal, e não `window.confirm`: o nativo bloqueia a aba e sai do tema.
          O aviso é explícito sobre o que vai junto porque a exclusão leva o
          gabarito e as respostas já gravadas — e isso não se desfaz. */}
      <Modal
        open={confirming}
        onClose={() => !removing && setConfirming(false)}
        title="Confirmar exclusão"
        description={`"${asset.title}" sai da Página de Integração.`}
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={removing}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={remove} disabled={removing}>
              {removing ? "Excluindo" : "Excluir definitivamente"}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 px-6 py-4 text-xs leading-relaxed text-muted">
          <p>O arquivo enviado é apagado do disco junto. Não há como desfazer.</p>
          {asset.kind === "FILME" && (
            <p className="text-warning">
              {asset.questionCount > 0
                ? `Vão junto as ${asset.questionCount} pergunta(s) com o gabarito e as respostas que os convidados já deram neste filme.`
                : "Os convidados que já concluíram continuam concluídos; a trilha passa a ter um filme a menos."}
            </p>
          )}
        </div>
      </Modal>
    </li>
  );
}

/** Novo convite: nome e telefone, os dois obrigatórios. */
function InviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { success, error } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, startSaving] = useTransition();

  function save() {
    startSaving(async () => {
      const res = await createIntegrationGuest({ fullName, phone });
      if (res.ok) {
        success("Convite gerado");
        onCreated();
      } else {
        error(res.error ?? "Não foi possível gerar o convite.");
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title="Novo convite"
      description="O link é pessoal e vai direto para o contato informado."
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !fullName.trim() || !phone.trim()}>
            {saving ? "Gerando" : "Gerar convite"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <div>
          <label htmlFor="guest-name" className="mb-1.5 block text-sm font-medium text-foreground">
            Nome completo
          </label>
          <Input id="guest-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="guest-phone" className="mb-1.5 block text-sm font-medium text-foreground">
            Número (WhatsApp)
          </label>
          <Input
            id="guest-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-0000"
            inputMode="tel"
          />
          <p className="mt-1 text-xs text-muted">
            É por aqui que o convidado é avisado quando as respostas não condizem com o filme.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/** Cadastro de uma peça nova (sem arquivo — o envio é o passo seguinte). */
function AssetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { success, error } = useToast();
  const [kind, setKind] = useState<IntegrationAssetRow["kind"]>("DOCUMENTO");
  const [title, setTitle] = useState("");
  const [focus, setFocus] = useState("");
  const [lesson, setLesson] = useState("");
  const [order, setOrder] = useState("1");
  const [saving, startSaving] = useTransition();

  function save() {
    startSaving(async () => {
      const res = await createIntegrationAsset({
        kind,
        title,
        focus: focus || undefined,
        lesson: lesson || undefined,
        order: Number(order) || 0,
      });
      if (res.ok) {
        success("Item cadastrado");
        onCreated();
      } else {
        error(res.error ?? "Não foi possível cadastrar.");
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title="Adicionar à Página de Integração"
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || title.trim().length < 2}>
            {saving ? "Salvando" : "Cadastrar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <div>
          <label htmlFor="asset-kind" className="mb-1.5 block text-sm font-medium text-foreground">
            Tipo
          </label>
          <Select
            id="asset-kind"
            value={kind}
            options={[
              { value: "DOCUMENTO", label: KIND_LABEL.DOCUMENTO },
              { value: "VIDEO", label: KIND_LABEL.VIDEO },
              { value: "FILME", label: KIND_LABEL.FILME },
            ]}
            onChange={(e) => setKind(e.target.value as IntegrationAssetRow["kind"])}
          />
          {kind === "FILME" && (
            <p className="mt-1 text-xs text-muted">
              O filme nasce sem perguntas. Cadastre-as depois, no botão
              &quot;Perguntas&quot; do card.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="asset-title" className="mb-1.5 block text-sm font-medium text-foreground">
            Título
          </label>
          <Input id="asset-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {kind === "FILME" && (
          <>
            <div>
              <label
                htmlFor="asset-order"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Ordem na trilha
              </label>
              <Input
                id="asset-order"
                type="number"
                min={1}
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="asset-focus"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Foco principal
              </label>
              <Input id="asset-focus" value={focus} onChange={(e) => setFocus(e.target.value)} />
            </div>
            <div>
              <label
                htmlFor="asset-lesson"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Lição chave
              </label>
              <Input id="asset-lesson" value={lesson} onChange={(e) => setLesson(e.target.value)} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Envio do arquivo, com progresso real (filme passa de 1 GB). */
function UploadModal({
  asset,
  onClose,
  onUploaded,
}: {
  asset: IntegrationAssetRow;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { success, error } = useToast();
  const { send, percent, phase, busy } = useUploadProgress();
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!file) return;
    const formData = new FormData();
    formData.set("assetId", asset.id);
    formData.set("file", file);
    const res = await send("integracao-arquivo", formData);
    if (res.ok) {
      success("Arquivo enviado");
      onUploaded();
    } else {
      error(res.error ?? "Falha no envio.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      title={`Enviar arquivo — ${asset.title}`}
      description={
        asset.kind === "DOCUMENTO"
          ? "PDF, Word, Excel, PowerPoint ou imagem."
          : "MP4, WebM, MOV ou MKV."
      }
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void upload()} disabled={!file || busy}>
            {busy ? "Enviando" : "Enviar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <input
          type="file"
          accept={
            asset.kind === "DOCUMENTO"
              ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg"
              : "video/*,.mkv"
          }
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
          aria-label="Arquivo"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
        />

        {busy && (
          <div>
            <Progress value={percent} label="Progresso do envio" />
            <p className="mt-1.5 text-xs text-muted">
              {phase === "processing"
                ? "Processando no servidor…"
                : `${Math.round(percent)}% enviado`}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
