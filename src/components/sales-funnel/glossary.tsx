"use client";

import { useState } from "react";
import { Collapse } from "@/components/ui/collapse";

/**
 * O quadro "Definição de oportunidade" do rodapé do canvas impresso.
 *
 * Vive no código, e não no banco: são definições estáveis do método, iguais
 * para todo funil e todo setor. Guardá-las em tabela daria a cada canvas uma
 * cópia que pode divergir das outras sem que ninguém perceba.
 */
const TERMOS = [
  {
    termo: "Cliente",
    texto:
      "A empresa ou pessoa que já comprou de você alguma vez, independentemente de quanto consumiu. Está na sua carteira de ativos, pré-inativos e inativos, e na base do CRM ou ERP.",
    dica: "Mantenha a base atualizada e classificada. Vender para quem já é cliente é muito mais lucrativo.",
  },
  {
    termo: "Prospect",
    texto:
      "Possível cliente que precisa ser trabalhado nos aspectos de relacionamento e fechamento. Vem de indicações, feiras, eventos, mídias sociais e listas segmentadas.",
    dica: "Busque canais qualificados e tenha estratégia para cada um. Nunca dependa só das indicações.",
  },
  {
    termo: "Lead",
    texto:
      "O possível prospect que o trabalho de marketing gera por meio dos canais digitais — conteúdo, mídias sociais, site.",
    dica: "Gere conteúdo que atraia seu público e desperte interesse suficiente para ele deixar uma informação de contato.",
  },
];

export function Glossary() {
  const [aberto, setAberto] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-surface-1 p-4">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between text-left font-semibold"
      >
        Cliente, Prospect e Lead — quem é quem
        <span aria-hidden className="text-muted">
          {aberto ? "−" : "+"}
        </span>
      </button>

      <Collapse open={aberto}>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {TERMOS.map((t) => (
            <div key={t.termo} className="rounded-md border border-border bg-surface-2 p-3">
              <h4 className="font-semibold">{t.termo}</h4>
              <p className="mt-1 text-sm text-muted">{t.texto}</p>
              <p className="mt-2 text-xs text-muted">
                <span className="font-medium">Dica:</span> {t.dica}
              </p>
            </div>
          ))}
        </div>
      </Collapse>
    </section>
  );
}
