"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, UserCheck } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface Credentials {
  username: string;
  password: string;
}

export interface CredentialsModalProps {
  open: boolean;
  onClose: () => void;
  credentials: Credentials | null;
  /** Nome do colaborador, para contextualizar a mensagem. */
  userName?: string;
}

/**
 * Confirmação de cadastro: exibe as credenciais geradas (usuário + senha)
 * UMA única vez, com botão para copiar tudo. A senha em claro não é
 * recuperável depois — o admin deve copiar e repassar ao colaborador agora.
 */
export function CredentialsModal({ open, onClose, credentials, userName }: CredentialsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!credentials) return null;

  const clipboardText =
    `Build.Connect — Dados de acesso\n` +
    `Usuário: ${credentials.username}\n` +
    `Senha: ${credentials.password}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(clipboardText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleClose() {
    setCopied(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-md">
      <div className="p-6">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">
            Usuário criado com sucesso
          </h2>
          <p className="mt-1 text-xs text-muted">
            {userName ? (
              <>
                Repasse os dados de acesso a{" "}
                <span className="font-medium text-foreground">{userName}</span>. A senha não será
                exibida novamente.
              </>
            ) : (
              "Repasse os dados de acesso ao colaborador. A senha não será exibida novamente."
            )}
          </p>
        </div>

        <div className="mt-5 space-y-3 rounded-xl border border-border bg-surface-2 p-4">
          <Field label="Nome de usuário" value={credentials.username} mono />
          <div className="border-t border-border" />
          <Field label="Senha gerada" value={credentials.password} mono icon />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={handleClose} className="h-11">
            Fechar
          </Button>
          <Button onClick={handleCopy} className="h-11">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar informações"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  value,
  mono = false,
  icon = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <KeyRound className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
        <p className={`truncate text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}
