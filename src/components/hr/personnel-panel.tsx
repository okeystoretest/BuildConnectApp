"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDashed,
  Download,
  Eye,
  FileWarning,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { paginate } from "@/lib/paginate";
import {
  EXPIRY_WARNING_DAYS,
  dayLabel,
  folderStatusLabel,
  type FolderStatus,
} from "@/lib/personnel-expiry";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createPersonnelFolder,
  renamePersonnelGroup,
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
 * Como cada estado se veste — num lugar só, porque o mesmo estado pinta o
 * ladrilho da pasta, o card do colaborador e o contador do painel, e três
 * tabelas de cor divergiriam na primeira mudança.
 *
 * `pendente` e `vencido` são ambos vermelhos: as duas coisas são falta de
 * documento válido no dossiê, e distinguir por tom faria o leitor decorar
 * qual vermelho é qual. O que os separa é a PALAVRA — "Pendente" e "Vencido".
 */
const STATUS: Record<
  FolderStatus,
  { label: string; tile: string; text: string; mark: string; plus: string; icon: React.ReactNode }
> = {
  pendente: {
    label: "Pendentes",
    tile: "border-danger/45 bg-danger/[0.06] hover:border-danger/70",
    text: "font-medium text-danger",
    mark: "border-danger/50 bg-danger/5",
    plus: "bg-danger/15 text-danger hover:bg-danger/25",
    icon: <FileWarning className="h-4 w-4" />,
  },
  vencido: {
    label: "Vencidos",
    tile: "border-danger/45 bg-danger/[0.06] hover:border-danger/70",
    text: "font-medium text-danger",
    mark: "border-danger bg-danger/15 text-danger",
    plus: "bg-danger/15 text-danger hover:bg-danger/25",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  cuidado: {
    label: "Cuidado",
    tile: "border-warning/50 bg-warning/[0.07] hover:border-warning/75",
    text: "font-medium text-warning",
    mark: "border-warning bg-warning/15 text-warning",
    plus: "bg-warning/15 text-warning hover:bg-warning/25",
    icon: <CalendarClock className="h-4 w-4" />,
  },
  opcional: {
    label: "Opcional",
    tile: "border-border bg-surface hover:border-border-strong",
    text: "text-muted",
    // Sem marca de entregue e sem alarme: a pasta está vazia, mas a falta não
    // é falta. O `+` continua convidando a enviar, para quem TEM o documento.
    mark: "border-dashed border-border-strong bg-surface-2",
    plus: "bg-surface-2 text-muted hover:bg-surface-3 hover:text-foreground",
    icon: <CircleDashed className="h-4 w-4" />,
  },
  ok: {
    label: "Em dia",
    tile: "border-border bg-surface hover:border-border-strong",
    text: "text-muted",
    mark: "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30",
    plus: "bg-surface-2 text-muted hover:bg-surface-3 hover:text-foreground",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
};

/** A ordem em que os contadores aparecem: do mais urgente ao mais tranquilo. */
const DASHBOARD_ORDER: readonly FolderStatus[] = ["pendente", "vencido", "cuidado", "ok"];

/**
 * Paleta das pílulas de setor: os tokens `sector-*`, que existem só para dizer
 * QUEM e nunca COMO ESTÁ.
 *
 * Nenhum tom semântico entra aqui. `danger` e `warning` dizem pendente e
 * parcial nos cards logo abaixo das pílulas, e `primary` é a cor de ação do
 * app — uma pílula "DHO" vermelha sobre uma fileira de cards vermelhos faz o
 * nome do setor parecer alarme.
 *
 * Seis tons para os seis setores. Além disso a cor se repete, e tudo bem: a
 * pílula traz o nome escrito, e a cor é reforço.
 */
const SECTOR_TONES = [
  { idle: "border-sector-1/40 bg-sector-1/10 text-sector-1 hover:border-sector-1", on: "border-sector-1 bg-sector-1 text-sector-fg" },
  { idle: "border-sector-2/40 bg-sector-2/10 text-sector-2 hover:border-sector-2", on: "border-sector-2 bg-sector-2 text-sector-fg" },
  { idle: "border-sector-3/40 bg-sector-3/10 text-sector-3 hover:border-sector-3", on: "border-sector-3 bg-sector-3 text-sector-fg" },
  { idle: "border-sector-4/40 bg-sector-4/10 text-sector-4 hover:border-sector-4", on: "border-sector-4 bg-sector-4 text-sector-fg" },
  { idle: "border-sector-5/40 bg-sector-5/10 text-sector-5 hover:border-sector-5", on: "border-sector-5 bg-sector-5 text-sector-fg" },
  { idle: "border-sector-6/40 bg-sector-6/10 text-sector-6 hover:border-sector-6", on: "border-sector-6 bg-sector-6 text-sector-fg" },
] as const;

/**
 * A cor de cada setor, escolhida e fixa — pelo SLUG, não pelo rótulo.
 *
 * O slug é a identidade; o rótulo é reescrito (o setor `ti` aparece como
 * "Retaguarda", o `rh` como "DHO"). Cor presa ao rótulo mudaria numa
 * renomeação, que é mudança de texto e não de setor.
 *
 * A atribuição segue a natureza de cada um, do tom mais frio ao mais quente:
 * Logística é rota e movimento, Produção é o chão de fábrica, Administrativo
 * é o institucional, DHO são as pessoas, Retaguarda é a tecnologia, e
 * Comercial é o que fala para fora.
 */
const SECTOR_COLOR: Record<string, number> = {
  logistica: 0, // ciano
  producao: 1, // azul
  administrativo: 2, // índigo
  rh: 3, // violeta — DHO
  ti: 4, // magenta — Retaguarda
  comercial: 5, // rosa
};

/**
 * Setor fora do mapa (criado depois desta escolha) cai num tom derivado do
 * próprio slug: estável entre sessões, sem repintar os que já têm cor. Pode
 * coincidir com um dos seis, e é o preço de não ter escolha registrada.
 */
function sectorTone(slug: string) {
  let index = SECTOR_COLOR[slug];
  if (index === undefined) {
    let hash = 0;
    for (let i = 0; i < slug.length; i += 1) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
    index = Math.abs(hash) % SECTOR_TONES.length;
  }
  // `?? [0]` é só para o índice calculado: o módulo nunca sai da faixa, mas
  // `noUncheckedIndexedAccess` não sabe disso.
  return SECTOR_TONES[index] ?? SECTOR_TONES[0];
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
  /*
   * O filtro da lista. "completo" não é um `FolderStatus`: é outra PERGUNTA.
   * Os quatro estados se excluem e somam o total; "completo" atravessa três
   * deles — quem entregou tudo e tem documento a vencer está em Cuidado e
   * completo ao mesmo tempo. Por isso ele não entra na grade dos quatro.
   */
  const [status, setStatus] = useState<FolderStatus | "completo" | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<PersonnelPerson | null>(null);

  // Os setores que de fato aparecem na lista, em ordem alfabética. Pílula de
  // setor sem ninguém dentro só ocuparia espaço e filtraria para o vazio.
  // Leva o slug junto: o filtro compara o rótulo, a cor vem do slug.
  const sectors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of roster) if (!seen.has(p.sector)) seen.set(p.sector, p.sectorSlug);
    return [...seen]
      .map(([label, slug]) => ({ label, slug }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [roster]);

  // O painel conta o recorte do SETOR, não o da busca: os números têm de
  // fechar com a lista logo abaixo, e recontar a cada tecla digitada faria os
  // contadores tremerem enquanto se procura alguém.
  const inSector = useMemo(
    () => roster.filter((p) => sector === null || p.sector === sector),
    [roster, sector],
  );
  const counts = useMemo(() => {
    // `opcional` entra por exigência do tipo e fica sempre em zero:
    // `personStatus` nunca o devolve (ver a tabela de severidade). Sem a
    // chave, um estado novo passaria despercebido aqui.
    const out: Record<FolderStatus, number> = {
      pendente: 0,
      vencido: 0,
      cuidado: 0,
      ok: 0,
      opcional: 0,
    };
    for (const p of inSector) out[p.status] += 1;
    return out;
  }, [inSector]);

  const completos = useMemo(() => inSector.filter((p) => p.complete).length, [inSector]);

  const term = query.trim().toLowerCase();
  const filtered = inSector.filter(
    (p) =>
      (status === null || (status === "completo" ? p.complete : p.status === status)) &&
      (!term ||
        p.name.toLowerCase().includes(term) ||
        p.username.toLowerCase().includes(term) ||
        p.sector.toLowerCase().includes(term)),
  );

  // Quinze por página. O quadro inteiro numa rolagem só afoga o painel de
  // contadores, que é o que a aba existe para mostrar primeiro.
  const current = paginate(filtered, page, 15);

  // Mudou o filtro, o setor ou a busca: volta para a primeira. Ficar na
  // página 4 de uma lista que agora tem uma mostraria vazio, e pareceria
  // "ninguém encontrado".
  const resetKey = `${status ?? ""}|${sector ?? ""}|${term}`;
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPage(1);
  }

  if (open) {
    return (
      <PersonFolders person={open} onBack={() => setOpen(null)} />
    );
  }

  return (
    <div className="space-y-4">
      {/* Quantos já têm o dossiê fechado: tudo o que se exige entregue e nada
          vencido. Fica ACIMA e separado dos quatro contadores de propósito —
          aqueles se excluem e somam o total, este atravessa três deles, e
          enfileirar os cinco faria os números parecerem somar e não somarem. */}
      <button
        type="button"
        onClick={() => setStatus(status === "completo" ? null : "completo")}
        aria-pressed={status === "completo"}
        className={cn(
          "focus-ring flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
          status === "completo"
            ? "border-foreground bg-surface-2"
            : "border-primary/40 bg-primary/[0.07] hover:border-primary/60",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-bold leading-none tracking-tight tabular-nums text-primary">
            {completos}
            {/* O total junto: "18" sozinho não diz se é bom. */}
            <span className="ml-1.5 text-sm font-medium text-muted">de {inSector.length}</span>
          </span>
          <span className="mt-1 block truncate text-xs text-foreground">
            {completos === 1 ? "colaborador com a pasta completa" : "colaboradores com a pasta completa"}
          </span>
          <span className="block truncate text-[11px] text-muted">
            Tudo o que se exige entregue, nada vencido. Pastas opcionais não contam.
          </span>
        </span>
      </button>

      {/* O painel do setor: o quadro inteiro em quatro números, e cada número
          é o filtro da lista abaixo. Clicar no contador aceso desliga o
          filtro — sem isso a única saída seria recarregar a aba. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {DASHBOARD_ORDER.map((key) => {
          const tone = STATUS[key];
          const active = status === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(active ? null : key)}
              aria-pressed={active}
              className={cn(
                "focus-ring flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                active ? "border-foreground bg-surface-2" : tone.tile,
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2",
                  tone.text,
                )}
              >
                {tone.icon}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-2xl font-bold leading-none tracking-tight tabular-nums",
                    tone.text,
                  )}
                >
                  {counts[key]}
                </span>
                <span className="mt-1 block truncate text-xs text-foreground">{tone.label}</span>
                <span className="block truncate text-[11px] text-muted">
                  {key === "pendente"
                    ? "Falta documento na pasta"
                    : key === "vencido"
                      ? "Documento fora da validade"
                      : key === "cuidado"
                        ? `Vence em até ${EXPIRY_WARNING_DAYS} dias`
                        : "Dossiê completo e válido"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <ContentToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Buscar colaborador"
        view={view}
        onViewChange={setView}
      />

      {status !== null && (
        <p className="text-xs text-muted">
          Mostrando {filtered.length} de {inSector.length} —{" "}
          {status === "completo" ? "pasta completa" : STATUS[status].label.toLowerCase()}.{" "}
          <button
            type="button"
            onClick={() => setStatus(null)}
            className="focus-ring rounded font-medium text-foreground underline underline-offset-2"
          >
            Ver todos
          </button>
        </p>
      )}

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
          {sectors.map(({ label, slug }) => {
            const tone = sectorTone(slug);
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
          {current.items.map((person) => {
            // A cor do card é o pior estado do dossiê — a mesma tabela do
            // ladrilho e do contador. Só quem deve alguma coisa chama atenção.
            const tone = STATUS[person.status];
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => setOpen(person)}
                  className={cn(
                    "focus-ring flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                    tone.tile,
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
                  {/* O estado escrito, e não só pintado: a cor nunca é a
                      única pista. A contagem de arquivos fica abaixo, porque
                      o que se procura aqui é quem está devendo. */}
                  <span className="shrink-0 text-right">
                    <span className={cn("block text-xs", tone.text)}>
                      {person.status === "pendente"
                        ? `${person.pendingFolders} ${person.pendingFolders === 1 ? "pasta vazia" : "pastas vazias"}`
                        : person.status === "vencido"
                          ? `${person.expiredFolders} ${person.expiredFolders === 1 ? "documento vencido" : "documentos vencidos"}`
                          : person.status === "cuidado"
                            ? `${person.warningFolders} ${person.warningFolders === 1 ? "documento a vencer" : "documentos a vencer"}`
                            : "Em dia"}
                    </span>
                    <span className="mt-0.5 block text-[11px] tabular-nums text-muted">
                      {person.fileCount} {person.fileCount === 1 ? "arquivo" : "arquivos"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={current} onChange={setPage} noun="colaboradores" />
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
  const [renaming, setRenaming] = useState<PersonnelFolderGroup | null>(null);
  const [uploadTo, setUploadTo] = useState<{
    key: string;
    label: string;
    expiresOn: string | null;
  } | null>(null);
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
          {groups.map((group) => (
            <section key={group.label} className="space-y-2">
              {/* A régua à direita do rótulo separa os grupos sem gastar uma
                  linha inteira de cabeçalho — o mosaico precisa da altura. */}
              <h4 className="group/bloco flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-muted">
                {group.label}
                <button
                  type="button"
                  onClick={() => setRenaming(group)}
                  aria-label={`Renomear o bloco ${group.label}`}
                  // Discreto até o ponteiro chegar perto, mas sempre presente
                  // para o teclado e para quem navega por toque.
                  className="focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted/50 transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:text-foreground group-hover/bloco:text-muted"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </h4>

              <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
                {group.folders.map((folder) => {
                  // Pasta vazia = documentação pendente, e pendência tem de
                  // saltar da tela: é para isso que a pasta vazia aparece.
                  // Com documento, quem manda na cor é o vencimento.
                  const tone = STATUS[folder.status];
                  const delivered = folder.files.length > 0;
                  return (
                    <li key={folder.key} className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenKey(folder.key)}
                        className={cn(
                          "focus-ring flex h-full w-full flex-col gap-2 rounded-xl border p-3 pr-16 text-left transition-colors",
                          tone.tile,
                        )}
                      >
                        {/* Sem corte: o ladrilho é largo o bastante para o
                            rótulo inteiro quebrar em linhas. O `min-h` segura
                            duas — os rótulos vão de "ASO" a uma frase, e
                            altura solta desalinharia a grade inteira. */}
                        <span className="min-h-[2.8em] text-[13px] font-medium leading-snug text-foreground">
                          {folder.label}
                        </span>
                        {/* O rótulo também é colorido: cor de borda sozinha não
                            chega a quem não distingue vermelho. */}
                        <span className={cn("text-[11px] tabular-nums", tone.text)}>
                          {folderStatusLabel(folder.status, folder.expiresOn, folder.files.length)}
                        </span>
                        {folder.status === "ok" && folder.expiresOn && (
                          <span className="text-[11px] tabular-nums text-muted">
                            Vence em {dayLabel(folder.expiresOn)}
                          </span>
                        )}
                      </button>

                      {/* Irmãos do ladrilho, não filhos: botão dentro de botão
                          é HTML inválido. `pointer-events-none` no invólucro
                          deixa o clique atravessar o checkbox e abrir a pasta —
                          um canto morto seria pior do que um canto inútil. */}
                      <span className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1.5">
                        {/* O checkbox é DERIVADO: marcado porque a pasta tem
                            arquivo. Não é clicável de propósito — marcar à mão
                            criaria uma segunda verdade e deixaria dar por
                            entregue uma pasta vazia, numa tela que existe para
                            dizer o que falta. O estado já está escrito acima,
                            então aqui ele é reforço. */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                            tone.mark,
                          )}
                        >
                          {delivered && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>

                        {/* Vai direto ao envio, sem passar pela gaveta —
                            fechar pendência é a razão da tela existir. */}
                        <button
                          type="button"
                          onClick={() =>
                            setUploadTo({
                              key: folder.key,
                              label: folder.label,
                              expiresOn: folder.expiresOn,
                            })
                          }
                          aria-label={`Enviar documento para ${folder.label}`}
                          className={cn(
                            "focus-ring pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                            tone.plus,
                          )}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </span>
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
          onUpload={() =>
            setUploadTo({
              key: openFolder.key,
              label: openFolder.label,
              expiresOn: openFolder.expiresOn,
            })
          }
          onChanged={load}
        />
      )}

      <NewFolderModal
        open={newFolderOpen}
        ownerId={person.id}
        onClose={() => setNewFolderOpen(false)}
        onCreated={load}
      />

      {renaming && (
        <RenameGroupModal
          group={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={load}
        />
      )}

      {/* Mesmo modal de envio das demais telas — só muda a porta (`uploadKind`)
          e os campos que dizem de quem e de qual pasta é o documento. `slug`
          vai vazio: aqui o destino é a pessoa, não o subsetor. */}
      {uploadTo && (
        <UploadDocument
          person={person}
          folder={uploadTo}
          onClose={() => setUploadTo(null)}
          onUploaded={load}
        />
      )}
    </div>
  );
}

/**
 * Envio de documento, com o vencimento do que está entrando.
 *
 * O mesmo modal de envio das demais telas — só muda a porta (`uploadKind`), os
 * campos que dizem de quem e de qual pasta é o documento, e a data. `slug` vai
 * vazio: aqui o destino é a pessoa, não o subsetor.
 *
 * A data vem no envio, e não num segundo passo depois, porque é o documento
 * NOVO que tem validade nova: o ASO que chega hoje vence em outra data que o
 * de dois anos atrás, e é este arquivo que a define.
 *
 * Pasta que já vence tem o campo preenchido com a data em vigor e EXIGE uma
 * data (o servidor recusa o envio sem ela) — sem isso o documento novo
 * herdaria o vencimento do antigo e a pasta seguiria vermelha com um ASO em
 * dia dentro. Pasta que não vence pode ganhar vencimento aqui: é por este
 * campo que uma pasta do catálogo, que ninguém "cria", passa a vencer.
 */
function UploadDocument({
  person,
  folder,
  onClose,
  onUploaded,
}: {
  person: PersonnelPerson;
  folder: { key: string; label: string; expiresOn: string | null };
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [day, setDay] = useState(folder.expiresOn ?? "");
  const required = folder.expiresOn !== null;

  return (
    <FileUploadModal
      open
      slug=""
      title="Arquivar documento"
      description={`${person.name} · ${folder.label}`}
      uploadKind="dp-documento"
      extraFields={{ ownerId: person.id, folder: folder.key, expiresAt: day }}
      onClose={onClose}
      onUploaded={onUploaded}
    >
      <div>
        <label htmlFor="dp-upload-expira" className="block text-xs font-medium text-muted">
          {required ? "Novo vencimento do documento" : "Vencimento do documento (opcional)"}
        </label>
        <input
          id="dp-upload-expira"
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="focus-ring mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground"
        />
      </div>
    </FileUploadModal>
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

/**
 * Renomeia um bloco de pastas.
 *
 * O aviso de que vale para todo mundo não é decoração: a tela inteira em volta
 * é a de UM colaborador, e sem ele a renomeação pareceria local.
 */
function RenameGroupModal({
  group,
  onClose,
  onRenamed,
}: {
  group: PersonnelFolderGroup;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [label, setLabel] = useState(group.label);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", group.key);
      fd.set("label", label);
      const res = await renamePersonnelGroup(fd);
      if (res.ok) {
        onClose();
        onRenamed();
      } else {
        setError(res.error ?? "Falha ao renomear o bloco.");
      }
    });
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Renomear bloco"
      description="O nome vale para todos os colaboradores — o bloco é o mesmo em todas as pastas."
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      }
    >
      <div className="px-6 py-4">
        <label htmlFor="dp-group-name" className="block text-xs font-medium text-muted">
          Nome do bloco
        </label>
        <input
          id="dp-group-name"
          value={label}
          maxLength={60}
          onChange={(e) => {
            setError(null);
            setLabel(e.target.value);
          }}
          className="focus-ring mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted/70"
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </Modal>
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
  const [expires, setExpires] = useState(false);
  const [day, setDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function close() {
    if (busy) return;
    setName("");
    setExpires(false);
    setDay("");
    setError(null);
    onClose();
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("ownerId", ownerId);
      fd.set("name", name);
      // "Não" manda vazio: a resposta é a pergunta respondida, não a data
      // digitada e depois escondida ao trocar o rádio para "Não".
      fd.set("expiresAt", expires ? day : "");
      const res = await createPersonnelFolder(fd);
      if (res.ok) {
        setName("");
        setExpires(false);
        setDay("");
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

        {/* Rádio, e não um interruptor: a pergunta tem duas respostas e as
            duas precisam estar visíveis. Um interruptor desligado não se
            distingue de uma pergunta não respondida. */}
        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-muted">Esse documento vence?</legend>
          <div className="mt-1.5 flex gap-4">
            {[
              { value: false, label: "Não" },
              { value: true, label: "Sim" },
            ].map((option) => (
              <label
                key={option.label}
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="radio"
                  name="dp-folder-expires"
                  checked={expires === option.value}
                  onChange={() => {
                    setError(null);
                    setExpires(option.value);
                  }}
                  className="focus-ring h-4 w-4 accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {expires && (
          <div className="mt-3">
            <label htmlFor="dp-folder-expira" className="block text-xs font-medium text-muted">
              Data de vencimento
            </label>
            <input
              id="dp-folder-expira"
              type="date"
              value={day}
              onChange={(e) => {
                setError(null);
                setDay(e.target.value);
              }}
              className="focus-ring mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground"
            />
            <p className="mt-1.5 text-[11px] text-muted">
              A pasta fica amarela {EXPIRY_WARNING_DAYS} dias antes e vermelha ao vencer. Enviar um
              documento novo com a data nova zera o aviso.
            </p>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
