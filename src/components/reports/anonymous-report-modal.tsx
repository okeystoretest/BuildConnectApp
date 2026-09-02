"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/ui/image-uploader";
import { cn, initials } from "@/lib/utils";
import {
  openReportSession,
  searchReportTargets,
  submitAnonymousReport,
  type ReportTargetOption,
} from "@/lib/reports/actions";
import { MAX_REPORT_ATTACHMENTS, REPORT_TARGET_MIN_QUERY } from "@/types/report";

export interface AnonymousReportModalProps {
  open: boolean;
  onClose: () => void;
}

/** Espera entre a última tecla e a busca no servidor. */
const DEBOUNCE_MS = 300;

/**
 * Formulário público de denúncia anônima.
 *
 * Vive na tela de LOGIN, antes da autenticação: pedir para entrar já
 * identificaria quem denuncia. Nada aqui — nem no que é enviado ao servidor —
 * carrega a identidade de quem preenche.
 *
 * Três campos: a quem se destina (busca por nome, com escolha na lista), o
 * relato e até cinco evidências. O destinatário é escolhido de uma lista
 * vinda do servidor, e não digitado livremente, para que a denúncia chegue ao
 * DHO já ligada a uma pessoa real.
 */
export function AnonymousReportModal({ open, onClose }: AnonymousReportModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReportTargetOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<ReportTargetOption | null>(null);

  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<readonly File[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentCode, setSentCode] = useState<string | null>(null);

  // Descarta respostas de buscas antigas que chegarem fora de ordem.
  const searchToken = useRef(0);

  // Bilhete assinado da sessão de preenchimento (ver lib/reports/ticket.ts).
  // Emitido quando o modal abre; renovado uma vez se vencer com o formulário
  // aberto. Não identifica quem preenche.
  const ticket = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let ativo = true;
    void openReportSession().then((r) => {
      if (ativo) ticket.current = r.ticket;
    });
    return () => {
      ativo = false;
    };
  }, [open]);

  function reset() {
    setQuery("");
    setResults([]);
    setTarget(null);
    setDescription("");
    setFiles([]);
    setErrors({});
    setFormError(null);
    setSentCode(null);
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  // Busca do destinatário, com espera entre teclas para não disparar uma
  // consulta por caractere.
  useEffect(() => {
    const term = query.trim();
    if (target || term.length < REPORT_TARGET_MIN_QUERY) {
      setResults([]);
      setSearching(false);
      return;
    }

    const token = ++searchToken.current;
    setSearching(true);
    const timer = setTimeout(() => {
      const buscar = async () => {
        let resposta = await searchReportTargets(term, ticket.current ?? "");

        // Bilhete vencido ou esgotado: pega outro e tenta uma única vez.
        if (resposta.renew) {
          const novo = await openReportSession();
          ticket.current = novo.ticket;
          resposta = novo.ticket
            ? await searchReportTargets(term, novo.ticket)
            : { targets: [] };
        }
        return resposta.targets;
      };

      void buscar()
        .then((found) => {
          if (token !== searchToken.current) return;
          setResults(found);
        })
        .finally(() => {
          if (token === searchToken.current) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, target]);

  async function handleSubmit() {
    const next: Record<string, string> = {};
    if (!target) next.targetUserId = "Busque e selecione o nome do destinatário.";
    if (description.trim().length < 20) {
      next.description = "Descreva o ocorrido com pelo menos 20 caracteres.";
    }
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || !target) return;

    setSubmitting(true);
    const data = new FormData();
    data.set("targetUserId", target.id);
    data.set("description", description);
    data.set("ticket", ticket.current ?? "");
    for (const file of files) data.append("attachments", file);

    const result = await submitAnonymousReport(data);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      setFormError(result.error ?? "Não foi possível registrar a denúncia.");
      return;
    }
    setSentCode(result.code ?? null);
  }

  return (
    <Modal open={open} onClose={handleClose} dismissible={!submitting} className="max-w-lg">
      <div className="scrollbar-slim max-h-[85vh] overflow-y-auto p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Denúncia anônima
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Recebida diretamente pelo DHO. Não registramos quem enviou.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {sentCode ? (
          // Confirmação: o código é a única referência que o denunciante leva.
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <div>
              <p className="text-base font-semibold text-foreground">Denúncia registrada</p>
              <p className="mt-1 text-sm text-muted">
                O DHO recebeu o relato e vai tratá-lo na Central de Denúncias.
              </p>
            </div>
            <p className="mx-auto w-fit rounded-lg border border-border bg-surface-2 px-4 py-2 font-mono text-sm text-foreground">
              {sentCode}
            </p>
            <p className="text-[11px] leading-relaxed text-muted">
              Guarde este código se quiser mencioná-lo depois. Como o envio é anônimo, não há
              como recuperá-lo por aqui.
            </p>
            <Button className="w-full" onClick={handleClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.06] p-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-foreground">
                Nenhum dado seu é solicitado ou gravado: não pedimos login, nome ou contato. O
                DHO recebe apenas o destinatário, o relato e as evidências anexadas.
              </p>
            </div>

            {/* Destinatário — busca com escolha na lista. */}
            <div>
              <Label htmlFor="report-target">A quem a denúncia se destina *</Label>

              {target ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
                    {initials(target.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{target.name}</span>
                    <span className="block truncate text-[11px] text-muted">{target.sector}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTarget(null);
                      setQuery("");
                    }}
                    className="focus-ring shrink-0 rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:text-foreground"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input
                      id="report-target"
                      value={query}
                      autoComplete="off"
                      onChange={(e) => {
                        setQuery(e.target.value);
                        if (errors.targetUserId) {
                          setErrors((prev) => ({ ...prev, targetUserId: "" }));
                        }
                      }}
                      placeholder="Digite parte do nome do colaborador"
                      className={cn("pl-9", errors.targetUserId && "border-danger")}
                      aria-invalid={Boolean(errors.targetUserId)}
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
                    )}
                  </div>

                  {query.trim().length > 0 &&
                    query.trim().length < REPORT_TARGET_MIN_QUERY && (
                      <p className="mt-1.5 text-[11px] text-muted">
                        Digite ao menos {REPORT_TARGET_MIN_QUERY} letras do nome.
                      </p>
                    )}

                  {results.length > 0 && (
                    <ul className="scrollbar-slim mt-1.5 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-1">
                      {results.map((option) => (
                        <li key={option.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setTarget(option);
                              setResults([]);
                              setErrors((prev) => ({ ...prev, targetUserId: "" }));
                            }}
                            className="focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                          >
                            <UserRound className="h-4 w-4 shrink-0 text-muted" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-foreground">
                                {option.name}
                              </span>
                              <span className="block truncate text-[11px] text-muted">
                                {option.sector}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!searching &&
                    results.length === 0 &&
                    query.trim().length >= REPORT_TARGET_MIN_QUERY && (
                      <p className="mt-1.5 text-[11px] text-muted">
                        Nenhum colaborador encontrado com esse nome.
                      </p>
                    )}
                </>
              )}

              {errors.targetUserId && (
                <p className="mt-1.5 text-xs text-danger">{errors.targetUserId}</p>
              )}
            </div>

            {/* Relato */}
            <div>
              <Label htmlFor="report-description">Descrição do ocorrido *</Label>
              <Textarea
                id="report-description"
                value={description}
                rows={6}
                maxLength={5000}
                placeholder="Conte o que aconteceu: quando, onde e quem estava envolvido."
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) setErrors((prev) => ({ ...prev, description: "" }));
                }}
                aria-invalid={Boolean(errors.description)}
              />
              {errors.description && (
                <p className="mt-1.5 text-xs text-danger">{errors.description}</p>
              )}
            </div>

            {/* Evidências */}
            <ImageUploader
              files={files}
              onChange={setFiles}
              max={MAX_REPORT_ATTACHMENTS}
              label="Evidências (opcional)"
            />

            {formError && (
              <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {formError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={submitting}
                className="h-11"
              >
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="h-11">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Enviando" : "Enviar denúncia"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
