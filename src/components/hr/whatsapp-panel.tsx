"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";
import { CheckCircle2, Loader2, PowerOff, RefreshCw, Send, Smartphone, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/providers/toast-provider";
import {
  drainWhatsappNow,
  getWhatsappLog,
  getWhatsappStatus,
  retryFailedWhatsapp,
  unlinkWhatsapp,
  type WhatsappLogRow,
} from "@/lib/whatsapp/actions";
import type { ConnectionInfo } from "@/lib/whatsapp/connection";

/**
 * Conexão do WhatsApp e auditoria dos envios.
 *
 * Esta tela existe porque, sem ela, parear exigiria caçar o QR no log do
 * container pelo console do Easy Panel. E porque um log de envios que ninguém
 * consegue abrir não é auditoria — é uma tabela.
 */

const STATUS_TONE = {
  conectado: "primary",
  aguardando_qr: "warning",
  conectando: "info",
  desconectado: "danger",
  desligado: "neutral",
} as const;

const STATUS_LABEL = {
  conectado: "Conectado",
  aguardando_qr: "Aguardando leitura do QR",
  conectando: "Conectando",
  desconectado: "Desconectado",
  desligado: "Desligado",
} as const;

const ROW_TONE = { ENVIADO: "primary", PENDENTE: "info", FALHOU: "danger" } as const;
const ROW_LABEL = { ENVIADO: "Enviado", PENDENTE: "Na fila", FALHOU: "Falhou" } as const;
const KIND_LABEL = { AVALIACAO: "Avaliação", FORMULARIO: "Formulário" } as const;

export function WhatsappPanel() {
  const { success, error } = useToast();
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [log, setLog] = useState<WhatsappLogRow[]>([]);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, startAction] = useTransition();

  const refresh = useCallback(async () => {
    const [status, rows] = await Promise.all([getWhatsappStatus(), getWhatsappLog()]);
    setInfo(status);
    setLog(rows);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Enquanto não conectou, o QR chega segundos depois de a conexão abrir e
  // expira sozinho — sem esta sondagem, a tela mostraria um código morto.
  // Conectado, parar de sondar: não há o que mudar sozinho.
  const aguardando = info?.state === "aguardando_qr" || info?.state === "conectando";
  useEffect(() => {
    if (!aguardando) return;
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [aguardando, refresh]);

  function handleUnlink() {
    startAction(async () => {
      const res = await unlinkWhatsapp();
      setConfirmUnlink(false);
      if (res.ok) {
        success("Número desvinculado. Escaneie o QR para parear outro.");
        await refresh();
      } else {
        error(res.error ?? "Não foi possível desvincular.");
      }
    });
  }

  function handleRetry() {
    startAction(async () => {
      const res = await retryFailedWhatsapp();
      if (res.requeued === 0) success("Nenhuma falha para reenviar.");
      else success(`${res.requeued} mensagem(ns) devolvida(s) à fila.`);
      await refresh();
    });
  }

  function handleDrain() {
    startAction(async () => {
      const res = await drainWhatsappNow();
      success(`${res.enviados} enviada(s), ${res.falhas} falha(s).`);
      await refresh();
    });
  }

  if (!info) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Consultando a conexão…
      </div>
    );
  }

  const naFila = log.filter((r) => r.status === "PENDENTE").length;
  const falhas = log.filter((r) => r.status === "FALHOU").length;

  return (
    <div className="space-y-5">
      {/* Estado da conexão */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Conexão do WhatsApp</p>
              <p className="text-xs text-muted">
                {info.number
                  ? `Número vinculado: ${info.number}`
                  : "Nenhum número vinculado no momento."}
              </p>
            </div>
          </div>
          <Badge tone={STATUS_TONE[info.state]}>{STATUS_LABEL[info.state]}</Badge>
        </div>

        {info.lastError && <p className="mt-3 text-xs text-warning">{info.lastError}</p>}

        {info.state === "desligado" && (
          <p className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted">
            As notificações estão desligadas. As mensagens continuam sendo enfileiradas e sairão
            assim que a variável <span className="font-mono text-foreground">WHATSAPP_ENABLED</span>{" "}
            for ligada no servidor e um número for pareado.
          </p>
        )}

        {info.qr && info.state === "aguardando_qr" && (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-5">
            {/* Fundo branco fixo: o QR precisa de contraste alto e não pode
                acompanhar o tema escuro, ou o leitor não enxerga. */}
            <Image
              src={info.qr}
              alt="QR Code para vincular o WhatsApp"
              width={264}
              height={264}
              unoptimized
            />
            <p className="max-w-sm text-center text-xs leading-relaxed text-neutral-600">
              No celular do chip dedicado: WhatsApp → Aparelhos conectados → Conectar um aparelho.
              O código expira em segundos e é trocado sozinho.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDrain} disabled={busy}>
            <Send className="h-4 w-4" />
            Enviar fila agora
          </Button>
          {falhas > 0 && (
            <Button variant="secondary" size="sm" onClick={handleRetry} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              Reenviar {falhas} falha(s)
            </Button>
          )}
          {(info.state === "conectado" || info.number) && (
            <Button variant="danger" size="sm" onClick={() => setConfirmUnlink(true)} disabled={busy}>
              <PowerOff className="h-4 w-4" />
              Desvincular
            </Button>
          )}
        </div>
      </div>

      {/* Auditoria */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Últimos envios</p>
          <p className="text-xs text-muted">
            {naFila} na fila · {falhas} com falha
          </p>
        </div>

        {log.length === 0 ? (
          <EmptyState
            icon={<Send className="h-5 w-5" />}
            title="Nenhuma notificação ainda"
            description="Ao designar uma avaliação ou publicar um formulário, os envios aparecem aqui."
          />
        ) : (
          <div className="scrollbar-slim max-h-96 space-y-2 overflow-y-auto">
            {log.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{row.name}</p>
                  <p className="text-xs text-muted">
                    {KIND_LABEL[row.kind]} · {row.when}
                  </p>
                  {row.error && <p className="mt-1 text-xs text-danger">{row.error}</p>}
                </div>
                <Badge tone={ROW_TONE[row.status]} className="shrink-0">
                  {row.status === "ENVIADO" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                  {row.status === "FALHOU" && <XCircle className="mr-1 h-3 w-3" />}
                  {ROW_LABEL[row.status]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        title="Desvincular o número"
        description="A sessão é apagada e um QR novo é gerado. Nenhuma mensagem sai até parear de novo."
        className="max-w-md"
        dismissible={!busy}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmUnlink(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleUnlink} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Desvinculando" : "Desvincular"}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-muted">
            Use isto para trocar o chip. A fila e o histórico de envios não são afetados — o que
            estiver pendente sai pelo número novo.
          </p>
        </div>
      </Modal>
    </div>
  );
}
