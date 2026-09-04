"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { initials } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteUser } from "@/lib/user-actions";
import type { ManagedUser } from "@/types/hr";
import type { Role } from "@/types";
import { UserFormModal } from "./user-form-modal";
import { CredentialsModal, type Credentials } from "./credentials-modal";

const ROLE_TONE: Record<Role, "neutral" | "info" | "accent"> = {
  COLABORADOR: "neutral",
  GESTOR: "info",
  ADMIN: "accent",
};

/** Avatar do usuário: exibe a foto (.webp) quando houver; senão, as iniciais. */
function Avatar({ user, size = "h-8 w-8" }: { user: ManagedUser; size?: string }) {
  if (user.avatarPath) {
    return (
      <span className={`${size} shrink-0 overflow-hidden rounded-full border border-border`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={user.avatarPath} alt={user.name} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary`}
    >
      {initials(user.name)}
    </span>
  );
}

export function UserManagementPanel({ users }: { users: readonly ManagedUser[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Credenciais recém-geradas para o modal de confirmação de cadastro.
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.name, user.username, ROLE_LABEL[user.role], user.sector, user.subsectors, user.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [users, query]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(user: ManagedUser) {
    setEditing(user);
    setFormOpen(true);
  }

  function handleSaved(creds?: Credentials) {
    // Só a criação retorna credenciais → abre a confirmação.
    if (creds) setCredentials(creds);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteUser(pendingDelete.id);
      if (res.ok) {
        setPendingDelete(null);
        router.refresh();
      } else {
        setDeleteError(res.error ?? "Falha ao remover.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Cadastre, edite e remova usuários da plataforma.</p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, usuário, nível ou setor"
          aria-label="Buscar usuário"
          className="focus-ring h-10 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted/70 transition-colors hover:border-border-strong"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum usuário encontrado"
          description="Ajuste a busca para localizar outro colaborador."
        />
      ) : (
        <>
        <div className="hidden rounded-xl border border-border bg-surface lg:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["Usuário", "Nível", "Setor / Subsetores", "Ações"].map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar user={user} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted">{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{user.sector}</p>
                    <p className="text-xs text-muted">{user.subsectors}</p>
                    {/* Telefone virou obrigatório depois que estes cadastros
                        já existiam. Marcar quem está sem é como se enxerga
                        quem falta — a coluna aceita nulo, a tela não finge
                        que está tudo preenchido. */}
                    <p className="mt-1 text-xs">
                      {user.phone ? (
                        <span className="text-muted">{user.phone}</span>
                      ) : (
                        <span className="text-warning">Sem telefone</span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        aria-label={`Editar ${user.name}`}
                        className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(user)}
                        aria-label={`Remover ${user.name}`}
                        className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {filtered.map((user) => (
            <article key={user.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <Avatar user={user} size="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted">{user.username}</p>
                </div>
                <Badge tone={ROLE_TONE[user.role]} className="shrink-0">
                  {ROLE_LABEL[user.role]}
                </Badge>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <p className="text-[10px] uppercase tracking-wide text-muted">Telefone</p>
                <p className="mt-0.5 text-sm">
                  {user.phone ? (
                    <span className="text-foreground">{user.phone}</span>
                  ) : (
                    <span className="text-warning">Sem telefone</span>
                  )}
                </p>
                <p className="mt-3 text-[10px] uppercase tracking-wide text-muted">Setor / Subsetores</p>
                <p className="mt-0.5 text-sm text-foreground">{user.sector}</p>
                <p className="text-xs text-muted">{user.subsectors}</p>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(user)}
                  aria-label={`Editar ${user.name}`}
                  className="focus-ring flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-surface-2 text-xs text-foreground transition-colors hover:bg-surface-3"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(user)}
                  aria-label={`Remover ${user.name}`}
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg bg-danger/15 text-danger transition-colors hover:bg-danger/25"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
        </>
      )}

      <UserFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
        onSaved={handleSaved}
      />

      <CredentialsModal
        open={credentials !== null}
        onClose={() => setCredentials(null)}
        credentials={credentials}
      />

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Remover usuário"
        description="Esta ação desativa o acesso do colaborador à plataforma."
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Removendo" : "Remover"}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-muted">
            Confirma a remoção de{" "}
            <span className="font-semibold text-foreground">{pendingDelete?.name}</span>?
          </p>
          {deleteError && <p className="mt-3 text-xs text-danger">{deleteError}</p>}
        </div>
      </Modal>
    </div>
  );
}
