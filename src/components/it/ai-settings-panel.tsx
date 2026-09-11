"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, PlugZap, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  removeAiKey,
  saveAiCredentials,
  saveAiInstruction,
  testAiConnection,
} from "@/lib/ai/settings-actions";
import type { AiSettingsView } from "@/lib/ai/settings-data";
import {
  AI_SCOPES,
  AI_SCOPE_HINT,
  AI_SCOPE_LABEL,
  API_KEY_MAX,
  INSTRUCTION_MAX,
  MODEL_MAX,
  type AiScope,
} from "@/lib/ai/scopes";

export interface AiSettingsPanelProps {
  settings: AiSettingsView;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      className={cn(
        "mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
        notice.tone === "ok"
          ? "border-info/30 bg-info/10 text-foreground"
          : "border-danger/30 bg-danger/10 text-danger",
      )}
    >
      {notice.tone === "ok" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
      {notice.text}
    </p>
  );
}

function draftsFrom(settings: AiSettingsView): Record<AiScope, string> {
  return Object.fromEntries(
    AI_SCOPES.map((s) => [s, settings.instructions[s].body]),
  ) as Record<AiScope, string>;
}

/**
 * Conexão com o Gemini: chave, modelo, testar, remover.
 *
 * O campo da chave nunca é preenchido pelo servidor — o placeholder mostra
 * "••••" + os 4 últimos caracteres da chave salva, e deixar em branco ao
 * salvar significa "manter". Apagar é um botão próprio, com confirmação.
 */
function ConnectionCard({ settings }: { settings: AiSettingsView }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(settings.model);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();

  useEffect(() => setModel(settings.model), [settings.model]);

  function save() {
    setNotice(null);
    start(async () => {
      const res = await saveAiCredentials({ apiKey: apiKey.trim() || undefined, model });
      if (res.ok) {
        setApiKey("");
        setNotice({ tone: "ok", text: "Configuração salva." });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: res.error ?? "Falha ao salvar." });
      }
    });
  }

  function test() {
    setNotice(null);
    start(async () => {
      const res = await testAiConnection();
      setNotice(
        res.ok
          ? { tone: "ok", text: `Conexão OK · ${res.model ?? settings.model}` }
          : { tone: "error", text: res.error ?? "Falha ao testar." },
      );
    });
  }

  function remove() {
    setNotice(null);
    start(async () => {
      const res = await removeAiKey();
      setConfirmRemove(false);
      if (res.ok) {
        setNotice({
          tone: "ok",
          text: "Chave removida. O botão Roteiro deixa de aparecer no Cronograma.",
        });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: res.error ?? "Falha ao remover." });
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <PlugZap className="h-4 w-4 text-primary" />
        Conexão com o Gemini
      </h3>
      <p className="mt-1 text-sm text-muted">
        A chave fica cifrada no banco e nunca volta a esta tela. Quem vê o Cronograma só
        ganha o botão &ldquo;Roteiro&rdquo; depois que ela está salva.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_260px]">
        <div>
          <Label htmlFor="ai-key">Chave da API</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={API_KEY_MAX}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                settings.hasKey
                  ? `••••••••••••${settings.keyHint ?? ""}`
                  : "Cole a chave do AI Studio"
              }
              className="pl-9"
              disabled={pending}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {settings.hasKey
              ? "Deixe em branco para manter a chave atual."
              : "Sem chave salva. Nenhum roteiro pode ser gerado."}
          </p>
        </div>
        <div>
          <Label htmlFor="ai-model">Modelo</Label>
          <Input
            id="ai-model"
            maxLength={MODEL_MAX}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-2.5-flash"
            disabled={pending}
          />
          <p className="mt-1 text-[11px] text-muted">
            Nome exato do modelo, como no Google AI Studio.
          </p>
        </div>
      </div>

      <NoticeBar notice={notice} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {settings.hasKey ? (
          <Button
            variant="secondary"
            onClick={() => setConfirmRemove(true)}
            disabled={pending}
            className="text-danger"
          >
            <Trash2 className="h-4 w-4" />
            Remover chave
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          {settings.hasKey && (
            <Button variant="secondary" onClick={test} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              Testar conexão
            </Button>
          )}
          <Button onClick={save} disabled={pending || model.trim().length === 0}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>

      {confirmRemove && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-4">
          <p className="text-sm text-foreground">
            Remover a chave? O botão &ldquo;Roteiro&rdquo; some de todos os cronogramas. Os
            roteiros já gerados continuam nos cards.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmRemove(false)}
              disabled={pending}
            >
              Manter
            </Button>
            <Button variant="danger" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remover
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Instruções do sistema, uma sub-aba por escopo. Cada sub-aba tem o seu
 * rascunho e o seu Salvar: salvar a OKEY não toca a Padrão.
 */
function InstructionsCard({ settings }: { settings: AiSettingsView }) {
  const router = useRouter();
  const [scope, setScope] = useState<AiScope>("DEFAULT");
  const [drafts, setDrafts] = useState<Record<AiScope, string>>(() => draftsFrom(settings));
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();

  // Dados novos do servidor (após refresh) sobrescrevem o rascunho — o que
  // está no banco é a verdade; o rascunho só existe entre digitar e salvar.
  useEffect(() => {
    setDrafts(draftsFrom(settings));
  }, [settings]);

  const current = drafts[scope];
  const saved = settings.instructions[scope];
  const dirty = current !== saved.body;

  function save() {
    setNotice(null);
    start(async () => {
      const res = await saveAiInstruction({ scope, body: current });
      if (res.ok) {
        setNotice({ tone: "ok", text: `Instrução ${AI_SCOPE_LABEL[scope]} salva.` });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: res.error ?? "Falha ao salvar." });
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        Instruções do sistema
      </h3>
      <p className="mt-1 text-sm text-muted">
        A instrução Padrão vale para todo roteiro. A da marca é acrescentada depois dela
        quando o card tem marca. Sem nenhuma instrução, a IA usa um texto mínimo.
      </p>

      <div
        role="tablist"
        className="mt-4 flex w-fit gap-1 rounded-lg border border-border bg-surface-2 p-1"
      >
        {AI_SCOPES.map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={scope === s}
            onClick={() => {
              setScope(s);
              setNotice(null);
            }}
            className={cn(
              "focus-ring rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              scope === s
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface-3 hover:text-foreground",
            )}
          >
            {AI_SCOPE_LABEL[s]}
            {drafts[s] !== settings.instructions[s].body && " •"}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">{AI_SCOPE_HINT[scope]}</p>

      <Textarea
        rows={12}
        maxLength={INSTRUCTION_MAX}
        value={current}
        onChange={(e) => setDrafts((d) => ({ ...d, [scope]: e.target.value }))}
        placeholder={
          scope === "DEFAULT"
            ? "Ex.: Você é roteirista da equipe de conteúdo. Escreva em português do Brasil, em até 60 segundos de fala, com gancho nos 3 primeiros segundos…"
            : `Ex.: Quando o card for da ${AI_SCOPE_LABEL[scope]}, use tom…`
        }
        className="mt-3 font-mono text-[13px] leading-relaxed"
        disabled={pending}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>
          {current.length} / {INSTRUCTION_MAX}
        </span>
        {saved.updatedAt && (
          <span>
            Salvo por {saved.updatedByName ?? "—"} · {formatWhen(saved.updatedAt)}
          </span>
        )}
      </div>

      <NoticeBar notice={notice} />

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={pending || !dirty}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </section>
  );
}

/**
 * Aba "Inteligência Artificial" da Retaguarda. Só o Admin chega aqui
 * (`ai.manage`); a página nem envia `settings` para os demais.
 */
export function AiSettingsPanel({ settings }: AiSettingsPanelProps) {
  return (
    <div className="space-y-5">
      <ConnectionCard settings={settings} />
      <InstructionsCard settings={settings} />
    </div>
  );
}
