"use client";

import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { enviarEvidencia } from "@/lib/weekly-report/actions";
import { evidenciaEhImagem } from "@/lib/weekly-report/labels";

type Modo = "link" | "imagem";

/**
 * Campo de evidência: um link ou um print.
 *
 * Os dois modos escrevem no MESMO campo (`evidence`), porque a pergunta que a
 * planilha fazia era só uma — "cadê a prova?". O que distingue um do outro é o
 * próprio valor: caminho começando em `/uploads/` é imagem nossa, o resto é
 * endereço. Uma coluna a mais para guardar essa distinção seria uma coluna que
 * pode discordar do valor ao lado dela.
 *
 * A imagem entra por Ctrl+V ou pelo seletor de arquivo, e sobe NA HORA: o
 * cartão guarda o caminho, não o binário, então é preciso ter o caminho antes
 * de salvar o formulário.
 */
export function EvidenceField({
  slug,
  value,
  onChange,
  disabled,
  id,
}: {
  slug: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const ehImagem = evidenciaEhImagem(value);
  const [modo, setModo] = useState<Modo>(ehImagem ? "imagem" : "link");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  async function subir(file: File) {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    const formData = new FormData();
    formData.set("slug", slug);
    formData.set("file", file);
    const r = await enviarEvidencia(formData);
    setEnviando(false);
    if (!r.ok || !r.path) {
      setErro(r.error ?? "Não foi possível enviar a imagem.");
      return;
    }
    onChange(r.path);
  }

  /** Primeira imagem da área de transferência. Ctrl+V de um print cai aqui. */
  function colar(e: React.ClipboardEvent) {
    const arquivo = Array.from(e.clipboardData.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!arquivo) return;
    e.preventDefault();
    void subir(arquivo);
  }

  /** Arrastar o print do explorador direto para a área. */
  function soltar(e: React.DragEvent) {
    const arquivo = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!arquivo) return;
    e.preventDefault();
    void subir(arquivo);
  }

  return (
    <div className="space-y-2">
      <Segmented
        options={[
          { value: "link", label: "Link" },
          { value: "imagem", label: "Imagem" },
        ]}
        value={modo}
        onChange={(m) => {
          setErro(null);
          setModo(m);
          // Trocar de modo limpa o valor do outro: um cartão não tem duas
          // evidências, e manter a antiga escondida faria o relatório apontar
          // para algo que ninguém escolheu.
          if ((m === "imagem") !== ehImagem) onChange("");
        }}
        ariaLabel="Tipo de evidência"
      />

      {modo === "link" ? (
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            id={id}
            className="pl-9"
            placeholder="https://…"
            inputMode="url"
            disabled={disabled}
            value={ehImagem ? "" : value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ) : ehImagem ? (
        <div className="relative overflow-hidden rounded-xl border border-border bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Evidência enviada" className="max-h-56 w-full object-contain" />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Remover imagem"
              className="focus-ring absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-muted transition-colors hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        /*
         * Div focável, e não `<button>`: o Ctrl+V precisa de um alvo que
         * receba o evento de colagem, e um botão engole a tecla de espaço
         * antes disso. O papel e o teclado são declarados à mão por isso.
         */
        <div
          id={id}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onPaste={colar}
          onDrop={soltar}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !disabled && inputArquivo.current?.click()}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            inputArquivo.current?.click();
          }}
          className={cn(
            "focus-ring flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface-2/50 px-4 py-5 text-center transition-colors",
            !disabled && "hover:border-primary/50",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {enviando ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
              <p className="text-xs text-muted">Enviando…</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-5 w-5 text-muted" aria-hidden />
              <p className="text-xs text-foreground">
                Cole o print com <kbd className="font-sans font-semibold">Ctrl+V</kbd>
              </p>
              <p className="text-[11px] text-muted">
                ou clique para escolher a imagem · JPG, PNG, WebP ou HEIC
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputArquivo}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          // Zera o input: sem isto, escolher o MESMO arquivo de novo depois de
          // remover a imagem não dispara `change` e nada acontece.
          e.target.value = "";
          if (arquivo) void subir(arquivo);
        }}
      />

      {erro && <p className="text-xs text-danger">{erro}</p>}
    </div>
  );
}
