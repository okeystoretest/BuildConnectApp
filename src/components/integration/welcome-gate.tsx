"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { confirmEntry } from "@/lib/integration/public-actions";

export interface WelcomeGateProps {
  token: string;
  /** Nome que o DHO cadastrou ao gerar o convite. */
  guestName: string;
  onEntered: () => void;
}

/**
 * Boas-vindas do convite: o convidado CONFIRMA que é ele.
 *
 * Era um campo de nome livre até 28/10/2026. Passou a ser confirmação quando
 * o convite virou pessoal (o DHO cadastra nome e telefone ao gerá-lo), e isso
 * fecha duas portas de uma vez: ninguém aparece no quadro do DHO com o nome
 * digitado errado, e ninguém entra como outra pessoa por um link encaminhado.
 *
 * `dismissible={false}` e sem botão de fechar: não existe navegar sem entrar.
 * E não é só a tela que segura — sem o cookie emitido aqui, `resolveGuest`
 * devolve null e nem os arquivos nem as actions respondem.
 */
export function WelcomeGate({ token, guestName, onEntered }: WelcomeGateProps) {
  const [error, setError] = useState<string | null>(null);
  const [entering, startEntering] = useTransition();

  function enter() {
    setError(null);
    startEntering(async () => {
      const res = await confirmEntry(token);
      if (res.ok) onEntered();
      else setError(res.error ?? "Não foi possível registrar sua entrada.");
    });
  }

  return (
    <Modal
      open
      dismissible={false}
      title="Bem-vindo(a) à Build.Connect"
      description="Sua integração começa aqui."
      className="max-w-md"
      footer={
        <Button onClick={enter} disabled={entering} className="w-full">
          {entering ? "Entrando" : "Sou eu, começar"}
        </Button>
      }
    >
      <div className="space-y-3 p-6">
        <p className="text-sm text-muted">Este convite foi preparado para:</p>
        <p className="rounded-xl border border-border bg-surface-2 p-4 text-lg font-semibold text-foreground">
          {guestName}
        </p>
        <p className="text-xs text-muted">
          Se este não é o seu nome, não prossiga — avise quem lhe enviou o link.
        </p>

        {error && (
          <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs leading-relaxed text-foreground">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
