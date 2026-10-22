"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  Download,
  Eye,
  FolderPlus,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createPersonnelFolder,
  deletePersonnelFile,
  deletePersonnelFolder,
  fetchPersonnelFolders,
} from "@/lib/personnel-actions";
import { FileUploadModal } from "@/components/sector/file-upload-modal";
import { ContentToolbar, type ViewMode } from "@/components/sector/content-toolbar";
import type { PersonnelFolder, PersonnelFolderGroup, PersonnelPerson } from "@/types/hr";

const KIND_STYLE = {
  PDF: "bg-danger/15 text-danger",
  DOCX: "bg-info/15 text-info",
  XLSX: "bg-primary/15 text-primary",
  PPTX: "bg-warning/15 text-warning",
} as const;

/**
 * Paleta das pílulas de setor. Mesmos tons do `Badge`, menos o `neutral`, que
 * é reservado para "Todos".
 */
const SECTOR_TONES = [
  { idle: "border-primary/30 bg-primary/10 text-primary hover:border-primary/60", on: "border-primary bg-primary text-primary-foreground" },
  { idle: "border-info/30 bg-info/10 text-info hover:border-info/60", on: "border-info bg-info text-white" },
  { idle: "border-accent/30 bg-accent/10 text-accent hover:border-accent/60", on: "border-accent bg-accent text-white" },
  { idle: "border-warning/30 bg-warning/10 text-warning hover:border-warning/60", on: "border-warning bg-warning text-white" },
  { idle: "border-danger/30 bg-danger/10 text-danger hover:border-danger/60", on: "border-danger bg-danger text-white" },
] as const;

/**
 * Cor do setor derivada do NOME, não da posição na lista: a pílula de "Vendas"
 * é a mesma em qualquer filtro, e continua a mesma quando um setor é criado ou
 * removido. Índice por ordem de aparição mudaria a cor de todo mundo.
 */
function sectorTone(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  // `?? [0]` é só para o índice calculado: o módulo nunca sai da faixa, mas
  // `noUncheckedIndexedAccess` não sabe disso.
  return SECTOR_TONES[Math.abs(hash) % SECTOR_TONES.length] ?? SECTOR_TONES[0];
}

/**
 * Departamento Pessoal (antiga aba "Documentos" do DHO).
 *
 * Dois níveis: a lista de colaboradores ATIVOS — cada um é a pasta dele, sem
 * rotina de criação — e, ao abrir, as pastas de documentação daquela pessoa.
 *
 * As pastas obrigatórias aparecem SEMPRE, mesmo vazias: é a pasta vazia que
 * diz o que ainda falta entregar. Esconder as vazias deixaria a tela limpa e
 * inútil para o que ela existe.
 */
export function PersonnelPanel({ roster }: { roster: readonly PersonnelPerson[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [sector, setSector] = useState<string | null>(null);
  const [open, setOpen] = useState<PersonnelPerson | null>(null);

  // Os setores que de fato aparecem na lista, em ordem alfabética. Pílula de
  // setor sem ninguém dentro só ocuparia espaço e filtraria para o vazio.
  const sectors = useMemo(
    () => [...new Set(roster.map((p) => p.sector))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [roster],
  );

  const term = query.trim().toLowerCase();
  const filtered = roster.filter(
    (p) =>
      (sector === null || p.sector === sector) &&
      (!term ||
        p.name.toLowerCase().includes(term) ||
        p.username.toLowerCase().includes(term) ||
        p.sector.toLowerCase().includes(term)),
  );

  if (open) {
    return (
      <PersonFolders person={open} onBack={() => setOpen(null)} />
    );
  }

  return (
    <div className="space-y-4">
      <ContentToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Buscar colaborador"
        view={view}
        onViewChange={setView}
      />

      {/* Uma pílula só não filtra nada: com um setor, todo mundo é dele. */}
      {sectors.length > 1 && (
        <div
          role="group"
          aria-label="Filtrar por setor"
          className="scrollbar-slim -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          <button
            type="button"
            onClick={() => setSector(null)}
            aria-pressed={sector === null}
            className={cn(
              "focus-ring shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              sector === null
                ? "border-foreground bg-foreground text-surface"
                : "border-border-strong bg-surface-2 text-muted hover:text-foreground",
            )}
          >
            Todos
          </button>
          {sectors.map((label) => {
            const tone = sectorTone(label);
            const active = sector === label;
            return (
              <button
                key={label}
                type="button"
                // Clicar no setor já ativo desliga o filtro — sem isso a única
                // saída seria achar o "Todos" depois de rolar a faixa.
                onClick={() => setSector(active ? null : label)}
                aria-pressed={active}
                className={cn(
                  "focus-ring shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active ? tone.on : tone.idle,
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="Nenhum colaborador encontrado"
          description="Só colaboradores com cadastro ativo têm pasta no Departamento Pessoal."
        />
      ) : (
        <ul
          className={cn(
            view === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-2",
          )}
        >
          {filtered.map((person) => {
            // Nada entregue é pendência (vermelho); entregue pela metade é
            // amarelo; com todas as pastas atendidas o card volta ao neutro —
            // só quem ainda deve alguma coisa chama atenção.
            const empty = person.fileCount === 0;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => setOpen(person)}
                  className={cn(
                    "focus-ring flex w-full items-center gap-3 rounded-xl border bg-surface p-4 text-left transition-colors",
                    person.complete
                      ? "border-border hover:border-border-strong"
                      : empty
                        ? "border-danger/40 bg-danger/[0.04] hover:border-danger/60"
                        : "border-warning/40 bg-warning/[0.04] hover:border-warning/60",
                  )}
                >
                  <Avatar
                    name={person.name}
                    avatarPath={person.avatarPath}
                    size="h-10 w-10"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {person.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {person.sector}
                    </span>
                  </span>
                  {/* A contagem já diz em texto o que a cor diz — a cor nunca
                      é a única pista do estado. */}
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      person.complete
                        ? "text-muted"
                        : empty
                          ? "font-medium text-danger"
                          : "font-medium text-warning",
                    )}
                  >
                    {person.fileCount} {person.fileCount === 1 ? "arquivo" : "arquivos"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Pastas de um colaborador, carregadas na abertura. */
function PersonFolders({
  person,
  onBack,
}: {
  person: PersonnelPerson;
  onBack: () => void;
}) {
  const [groups, setGroups] = useState<PersonnelFolderGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [uploadTo, setUploadTo] = useState<{ key: string; label: string } | null>(null);
  const [busy, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await fetchPersonnelFolders(person.id);
      if (res.ok && res.groups) {
        setGroups(res.groups);
        setError(null);
      } else {
        setError(res.error ?? "Falha ao carregar as pastas.");
      }
    });
  }, [person.id]);

  useEffect(load, [load]);

  // A pasta aberta é DERIVADA das pastas carregadas: guardar o objeto deixaria
  // a gaveta exibindo a lista anterior depois de enviar ou excluir um arquivo.
  const openFolder = groups?.flatMap((g) => g.folders).find((f) => f.key === openKey) ?? null;

  return (
    <div className="space-y-4" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar para a lista de colaboradores"
            className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-foreground transition-colors hover:bg-surface-3"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{person.name}</h3>
            <p className="truncate text-xs text-muted">{person.sector}</p>
          </div>
        </div>

        {/* "Adicionar mais pastas": a aba já é exclusiva de quem administra o
            DHO (Admin + Gestor lotado nele), e é essa a régua da criação. */}
        <Button variant="secondary" onClick={() => setNewFolderOpen(true)} disabled={busy}>
          <FolderPlus className="h-4 w-4" />
          Adicionar mais pastas
        </Button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {groups === null ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando pastas…
        </div>
      ) : (
        <>
          <Completeness groups={groups} />

          {groups.map((group) => (
            <section key={group.label} className="space-y-2">
              {/* A régua à direita do rótulo separa os grupos sem gastar uma
                  linha inteira de cabeçalho — o mosaico precisa da altura. */}
              <h4 className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.11em] text-muted">
                {group.label}
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </h4>

              <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]">
                {group.folders.map((folder) => {
                  // Pasta vazia = documentação pendente, e pendência tem de
                  // saltar da tela: é para isso que a pasta vazia aparece.
                  const pending = folder.files.length === 0;
                  return (
                    <li key={folder.key} className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenKey(folder.key)}
                        className={cn(
                          "focus-ring flex h-full w-full flex-col gap-2 rounded-xl border p-3 pr-10 text-left transition-colors",
                          pending
                            ? "border-danger/45 bg-danger/[0.06] hover:border-danger/70"
                            : "border-border bg-surface hover:border-border-strong",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            pending ? "bg-danger" : "bg-primary",
                          )}
                        />
                        {/* Duas linhas fixas: os rótulos do catálogo variam de
                            "ASO" a uma frase, e altura solta desalinharia a
                            grade inteira. */}
                        <span className="line-clamp-2 min-h-[2.2em] text-[13px] font-medium leading-snug text-foreground">
                          {folder.label}
                        </span>
                        {/* O rótulo também é vermelho: cor de borda sozinha não
                            chega a quem não distingue vermelho. */}
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            pending ? "font-medium text-danger" : "text-muted",
                          )}
                        >
                          {pending
                            ? "Pendente"
                            : `${folder.files.length} ${folder.files.length === 1 ? "arquivo" : "arquivos"}`}
                        </span>
                      </button>

                      {/* Irmão do ladrilho, não filho: botão dentro de botão é
                          HTML inválido. Vai direto ao envio, sem passar pela
                          gaveta — fechar pendência é a razão da tela existir. */}
                      <button
                        type="button"
                        onClick={() => setUploadTo({ key: folder.key, label: folder.label })}
                        aria-label={`Enviar documento para ${folder.label}`}
                        className={cn(
                          "focus-ring absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                          pending
                            ? "bg-danger/15 text-danger hover:bg-danger/25"
                            : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-foreground",
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {openFolder && (
        <FolderSheet
          folder={openFolder}
          person={person}
          onClose={() => setOpenKey(null)}
          onUpload={() => setUploadTo({ key: openFolder.key, label: openFolder.label })}
          onChanged={load}
        />
      )}

      <NewFolderModal
        open={newFolderOpen}
        ownerId={person.id}
        onClose={() => setNewFolderOpen(false)}
        onCreated={load}
      />

      {/* Mesmo modal de envio das demais telas — só muda a porta (`uploadKind`)
          e os campos que dizem de quem e de qual pasta é o documento. `slug`
          vai vazio: aqui o destino é a pessoa, não o subsetor. */}
      {uploadTo && (
        <FileUploadModal
          open
          slug=""
          title="Arquivar documento"
          description={`${person.name} · ${uploadTo.label}`}
          uploadKind="dp-documento"
          extraFields={{ ownerId: person.id, folder: uploadTo.key }}
          onClose={() => setUploadTo(null)}
          onUploaded={load}
        />
      )}
    </div>
  );
}

/**
 * Quanto do dossiê já foi entregue, em número e em imagem.
 *
 * Um segmento por pasta, na ordem da tela: o painel responde "o que falta
 * desta pessoa" antes de qualquer rótulo ser lido. A contagem ao lado diz o
 * mesmo em texto — a barra é reforço, nunca a única pista.
 */
function Completeness({ groups }: { groups: readonly PersonnelFolderGroup[] }) {
  const folders = groups.flatMap((g) => g.folders);
  const done = folders.filter((f) => f.files.length > 0).length;
  const pending = folders.length - done;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {done} de {folders.length} {folders.length === 1 ? "pasta entregue" : "pastas entregues"}
        </p>
        <p
          className={cn(
            "text-xs tabular-nums",
            pending > 0 ? "font-medium text-danger" : "text-primary",
          )}
        >
          {pending > 0
            ? `${pending} ${pending === 1 ? "pendente" : "pendentes"}`
            : "Documentação completa"}
        </p>
      </div>

      <div aria-hidden="true" className="mt-2.5 flex gap-[3px]">
        {folders.map((f) => (
          <span
            key={f.key}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              f.files.length > 0 ? "bg-primary" : "bg-danger",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Os arquivos de uma pasta, por cima do mosaico.
 *
 * Modal e não gaveta lateral: é o recipiente que o resto do módulo já usa
 * (envio, nova pasta, confirmação de exclusão), e ele cumpre o mesmo papel —
 * mostrar o conteúdo sem desmontar o panorama atrás.
 */
function FolderSheet({
  folder,
  person,
  onClose,
  onUpload,
  onChanged,
}: {
  folder: PersonnelFolder;
  person: PersonnelPerson;
  onClose: () => void;
  onUpload: () => void;
  onChanged: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={folder.label}
      description={`${person.name} · ${
        folder.files.length === 0
          ? "nenhum documento arquivado"
          : `${folder.files.length} ${folder.files.length === 1 ? "arquivo" : "arquivos"}`
      }`}
      className="max-w-xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Quem chega nesta aba já é Admin ou Gestor lotado no DHO — não há
              terceiro papel para distinguir aqui, e os dois excluem. A pasta
              modelo também sai: a remoção fica gravada por colaborador, e
              recriá-la pelo mesmo nome a traz de volta.

              `mr-auto` a mantém sozinha à esquerda, longe das ações de
              rotina: ela apaga a pasta e os arquivos juntos. */}
          <DeleteButton
            label={`Excluir a pasta ${folder.label}`}
            confirm={
              folder.fixed
                ? `Excluir a pasta modelo "${folder.label}" e os ${folder.files.length} arquivo(s) dentro dela? Ela sai da lista deste colaborador; criar uma pasta com o mesmo nome a traz de volta.`
                : `Excluir a pasta "${folder.label}" e os ${folder.files.length} arquivo(s) dentro dela? Isso não se desfaz.`
            }
            onConfirm={async () => {
              const fd = new FormData();
              fd.set("ownerId", person.id);
              fd.set("folder", folder.key);
              return deletePersonnelFolder(fd);
            }}
            onDone={() => {
              onClose();
              onChanged();
            }}
            className="mr-auto"
          />

          {/* O Modal da casa não tem "X": sem este botão a única saída seria
              clicar no fundo ou apertar Esc, e nenhuma das duas se vê. */}
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={onUpload}>
            <Upload className="h-4 w-4" />
            Enviar documento
          </Button>
        </div>
      }
    >
      {/* O corpo do Modal não tem padding próprio: `px-6` vive no cabeçalho
          e no rodapé, e o conteúdo é de quem chama. Sem isto a lista de
          arquivos encosta nas bordas. */}
      <div className="px-6 py-4">
        {folder.files.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-xs text-muted">
            Nenhum documento arquivado nesta pasta.
          </p>
        ) : (
          <ul className="space-y-2">
            {folder.files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 rounded-lg bg-surface-2 p-2.5"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold",
                    KIND_STYLE[file.kind],
                  )}
                >
                  {file.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{file.name}</span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted">{file.size}</span>
                </span>
                <a
                  href={file.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visualizar ${file.name}`}
                  className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-foreground transition-colors hover:bg-surface"
                >
                  <Eye className="h-3.5 w-3.5" />
                </a>
                <a
                  href={file.filePath}
                  download
                  aria-label={`Baixar ${file.name}`}
                  className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary transition-colors hover:bg-primary/25"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <DeleteButton
                  label={`Excluir ${file.name}`}
                  confirm={`Excluir "${file.name}"? Isso não se desfaz.`}
                  onConfirm={async () => {
                    const fd = new FormData();
                    fd.set("id", file.id);
                    return deletePersonnelFile(fd);
                  }}
                  onDone={onChanged}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/**
 * Botão de exclusão com confirmação em modal.
 *
 * Modal, e não `window.confirm`: o diálogo nativo bloqueia a aba inteira e sai
 * do tema da aplicação — e o que está em jogo é o único exemplar de um
 * documento admissional.
 */
function DeleteButton({
  label,
  confirm,
  onConfirm,
  onDone,
  className,
}: {
  label: string;
  confirm: string;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await onConfirm();
      if (res.ok) {
        setOpen(false);
        setError(null);
        onDone();
      } else {
        setError(res.error ?? "Falha ao excluir.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={cn(
          "focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/15 text-danger transition-colors hover:bg-danger/25",
          className,
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Confirmar exclusão"
        description={confirm}
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </div>
        }
      >
        {error ? <p className="px-6 py-4 text-xs text-danger">{error}</p> : null}
      </Modal>
    </>
  );
}

function NewFolderModal({
  open,
  ownerId,
  onClose,
  onCreated,
}: {
  open: boolean;
  ownerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function close() {
    if (busy) return;
    setName("");
    setError(null);
    onClose();
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("ownerId", ownerId);
      fd.set("name", name);
      const res = await createPersonnelFolder(fd);
      if (res.ok) {
        setName("");
        setError(null);
        onClose();
        onCreated();
      } else {
        setError(res.error ?? "Falha ao criar a pasta.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Adicionar pasta"
      description="A pasta vale só para este colaborador. As pastas obrigatórias já existem."
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar pasta
          </Button>
        </div>
      }
    >
      <div className="px-6 py-4">
        <label htmlFor="dp-folder-name" className="block text-xs font-medium text-muted">
          Nome da pasta
        </label>
        <input
          id="dp-folder-name"
          value={name}
          maxLength={60}
          onChange={(e) => {
            setError(null);
            setName(e.target.value);
          }}
          placeholder="Ex.: Advertências"
          className="focus-ring mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted/70"
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
