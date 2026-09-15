"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { MultiChipGroup } from "@/components/ui/multi-chip-group";
import { AvatarPicker } from "@/components/ui/avatar-picker";
import { PasswordInput } from "@/components/ui/password-input";
import { initials } from "@/lib/utils";
import { UNITS } from "@/lib/units";
import { SECTOR_LABELS, SECTOR_TREE, getSubsectors } from "@/lib/sector-tree";
import { ROLE_LABEL } from "@/lib/permissions";
import { useRole } from "@/providers/role-provider";
import { createUser, updateUser } from "@/lib/user-actions";
import {
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  suggestUsername,
  type UserFormErrors,
  type UserFormState,
} from "@/types/user-form";
import { formatPhone, isValidPhone, normalizePhone } from "@/lib/phone";
import type { Role } from "@/types";
import type { ManagedUser } from "@/types/hr";
import type { Credentials } from "./credentials-modal";

const ROLE_OPTIONS: readonly { value: Role; label: string }[] = [
  { value: "COLABORADOR", label: ROLE_LABEL.COLABORADOR },
  { value: "GESTOR", label: ROLE_LABEL.GESTOR },
  { value: "ADMIN", label: ROLE_LABEL.ADMIN },
];

function emptyState(): UserFormState {
  return {
    photo: null,
    fullName: "",
    username: "",
    password: "",
    phone: "",
    role: "COLABORADOR",
    sector: "",
    unit: "",
    subsectors: [],
  };
}

export interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  initial?: ManagedUser | null;
  /**
   * Chamado após salvar com sucesso. Na criação, recebe as credenciais
   * geradas para o modal de confirmação; na edição, vem sem argumento.
   */
  onSaved?: (credentials?: Credentials) => void;
}

function stateFromUser(user: ManagedUser): UserFormState {
  return {
    photo: null,
    fullName: user.name,
    username: user.username,
    password: "",
    // Vem já com máscara da listagem; vazio nos cadastrados antes do campo.
    phone: user.phone ?? "",
    role: user.role,
    sector: user.sector === "—" ? "" : user.sector,
    unit: "",
    subsectors:
      user.subsectors === "—" ? [] : user.subsectors.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export function UserFormModal({ open, onClose, initial, onSaved }: UserFormModalProps) {
  const router = useRouter();
  const { role: actorRole } = useRole();

  // Só o Admin cria ou promove alguém a Admin. Para o Gestor do DHO a opção
  // nem aparece — e a action recusa se vier por outro caminho.
  const roleOptions = useMemo(
    () => (actorRole === "ADMIN" ? ROLE_OPTIONS : ROLE_OPTIONS.filter((o) => o.value !== "ADMIN")),
    [actorRole],
  );
  const isEdit = Boolean(initial);
  const [form, setForm] = useState<UserFormState>(emptyState);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [topError, setTopError] = useState<string | null>(null);

  // Ao abrir em modo edição, carrega os dados do usuário.
  useEffect(() => {
    if (open) {
      setForm(initial ? stateFromUser(initial) : emptyState());
      setErrors({});
      setTopError(null);
      setUsernameTouched(Boolean(initial));
    }
  }, [open, initial]);

  /**
   * Blocos de subsetores: TODOS os setores, não só o principal. Uma pessoa
   * pode ser de Comercial › Vendas e de Produção › Criação ao mesmo tempo —
   * o acesso já é por subsetor (ver lib/auth/access), o formulário é que
   * limitava a um setor. Setores sem subsetor (Retaguarda, DHO) não têm
   * bloco: entram só como setor principal.
   */
  const subsectorGroups = useMemo(
    () => SECTOR_TREE.filter((sector) => sector.subsectors.length > 0),
    [],
  );
  const principalHasSubsectors = getSubsectors(form.sector).length > 0;

  function patch(next: Partial<UserFormState>) {
    setForm((prev) => ({ ...prev, ...next }));
    setErrors({});
  }

  function handleNameChange(value: string) {
    // Sugere o usuário enquanto o campo não foi editado à mão.
    patch({
      fullName: value,
      ...(usernameTouched ? {} : { username: suggestUsername(value) }),
    });
  }

  function handlePhoneChange(value: string) {
    // Mascara enquanto digita, mas só quando o número já está completo — do
    // contrário os parênteses brigam com o apagar.
    const digits = normalizePhone(value);
    patch({ phone: digits.length >= 10 ? formatPhone(digits.slice(0, 11)) : value });
  }

  function handleSectorChange(value: string) {
    // Os subsetores marcados são independentes do setor principal — trocar
    // a lotação não desfaz o acesso a outros setores.
    patch({ sector: value });
  }

  function validate(): boolean {
    const next: UserFormErrors = {};

    if (!form.fullName.trim()) next.fullName = "Informe o nome completo.";
    if (!form.username.trim()) next.username = "Informe o nome de usuário.";
    else if (!USERNAME_PATTERN.test(form.username.trim())) {
      next.username = "Use o padrão nome#BC, em minúsculas.";
    }
    // Mesma regra do servidor. A tela adianta o erro; quem recusa é a action.
    const phone = normalizePhone(form.phone);
    if (!phone) next.phone = "Informe o telefone.";
    else if (!isValidPhone(phone)) next.phone = "Telefone inválido. Use DDD + número.";

    // Senha só é validada na EDIÇÃO. Na criação, é gerada no servidor.
    if (isEdit && form.password && form.password.length < MIN_PASSWORD_LENGTH) {
      next.password = `A senha precisa de ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (!form.sector) next.sector = "Selecione o setor.";
    if (!form.unit) next.unit = "Selecione a unidade.";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function reset() {
    setForm(emptyState());
    setErrors({});
    setUsernameTouched(false);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSave() {
    if (!validate()) return;
    setTopError(null);

    const fd = new FormData();
    if (isEdit && initial) fd.set("id", initial.id);
    fd.set("fullName", form.fullName.trim());
    fd.set("username", form.username.trim());
    // Senha só trafega na edição, quando o admin a informa manualmente.
    if (isEdit && form.password) fd.set("password", form.password);
    fd.set("role", form.role);
    fd.set("phone", normalizePhone(form.phone));
    fd.set("sector", form.sector);
    fd.set("unit", form.unit);
    for (const sub of form.subsectors) fd.append("subsectors", sub);
    if (form.photo instanceof File) fd.set("photo", form.photo);

    startSubmit(async () => {
      const res = isEdit ? await updateUser(fd) : await createUser(fd);
      if (res.ok) {
        reset();
        onClose();
        onSaved?.(res.credentials);
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors as UserFormErrors);
        setTopError(res.error ?? "Não foi possível salvar.");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-lg">
      <div className="scrollbar-slim max-h-[85vh] overflow-y-auto p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {isEdit ? "Editar usuário" : "Novo usuário"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {isEdit ? "Atualize os dados de acesso." : "Dados de acesso do colaborador."}
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

        <div className="space-y-5">
          <AvatarPicker
            file={form.photo}
            onChange={(photo) => patch({ photo })}
            fallback={form.fullName.trim() ? initials(form.fullName) : "?"}
          />

          <div>
            <label htmlFor="full-name" className="mb-1.5 block text-xs font-medium text-foreground">
              Nome completo
            </label>
            <Input
              id="full-name"
              value={form.fullName}
              placeholder="Ex.: Maria Silva"
              onChange={(e) => handleNameChange(e.target.value)}
              aria-invalid={Boolean(errors.fullName)}
              className="h-11 rounded-xl"
            />
            {errors.fullName && <p className="mt-1.5 text-xs text-danger">{errors.fullName}</p>}
          </div>

          <div>
            <label htmlFor="phone" className="mb-1.5 block text-xs font-medium text-foreground">
              Telefone
            </label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              placeholder="(11) 98765-4321"
              autoComplete="off"
              onChange={(e) => handlePhoneChange(e.target.value)}
              aria-invalid={Boolean(errors.phone)}
              className="h-11 rounded-xl"
            />
            {errors.phone && <p className="mt-1.5 text-xs text-danger">{errors.phone}</p>}
          </div>

          <div>
            <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-foreground">
              Nome de usuário
            </label>
            <Input
              id="username"
              value={form.username}
              placeholder="maria#BC"
              autoComplete="off"
              onChange={(e) => {
                setUsernameTouched(true);
                patch({ username: e.target.value });
              }}
              aria-invalid={Boolean(errors.username)}
              className="h-11 rounded-xl"
            />
            {errors.username ? (
              <p className="mt-1.5 text-xs text-danger">{errors.username}</p>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted">
                Padrão de nomenclatura: <strong className="text-foreground">nome#BC</strong>
              </p>
            )}
          </div>

          {isEdit ? (
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-foreground">
                Alterar senha
              </label>
              <PasswordInput
                id="password"
                value={form.password}
                placeholder="Deixe em branco para manter a atual"
                autoComplete="new-password"
                onChange={(e) => patch({ password: e.target.value })}
                aria-invalid={Boolean(errors.password)}
                className="h-11 rounded-xl"
              />
              {errors.password ? (
                <p className="mt-1.5 text-xs text-danger">{errors.password}</p>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted">
                  Preencha apenas se quiser definir uma nova senha (mín. {MIN_PASSWORD_LENGTH}{" "}
                  caracteres).
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-medium text-foreground">Senha gerada automaticamente</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Uma senha segura será criada ao salvar e exibida na confirmação, para você
                  repassar ao colaborador.
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">Nível de acesso</p>
            <Segmented
              options={roleOptions}
              value={form.role}
              onChange={(role) => patch({ role })}
              ariaLabel="Nível de acesso"
            />
            {errors.role && <p className="mt-1.5 text-xs text-danger">{errors.role}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sector" className="mb-1.5 block text-xs font-medium text-foreground">
                Setor principal
              </label>
              <Select
                id="sector"
                options={SECTOR_LABELS}
                placeholder="Selecione o setor"
                value={form.sector}
                onChange={(e) => handleSectorChange(e.target.value)}
                aria-invalid={Boolean(errors.sector)}
              />
              {errors.sector && <p className="mt-1.5 text-xs text-danger">{errors.sector}</p>}
            </div>

            <div>
              <label htmlFor="unit" className="mb-1.5 block text-xs font-medium text-foreground">
                Unidade / Loja
              </label>
              <Select
                id="unit"
                options={UNITS}
                placeholder="Selecione a unidade"
                value={form.unit}
                onChange={(e) => patch({ unit: e.target.value })}
                aria-invalid={Boolean(errors.unit)}
              />
              {errors.unit && <p className="mt-1.5 text-xs text-danger">{errors.unit}</p>}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-foreground">Subsetores</p>
            <p className="mb-2 mt-0.5 text-[11px] text-muted">
              Marque os subsetores que o usuário acessa — de um ou de vários setores.
            </p>
            <div className="space-y-3">
              {subsectorGroups.map((sector) => (
                <div key={sector.label}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {sector.label}
                  </p>
                  <MultiChipGroup
                    options={sector.subsectors}
                    values={form.subsectors}
                    onChange={(subsectors) => patch({ subsectors })}
                    ariaLabel={`Subsetores de ${sector.label}`}
                  />
                </div>
              ))}
            </div>
            {form.subsectors.length === 0 && form.sector && (
              <p className="mt-2 text-[11px] text-muted">
                {principalHasSubsectors
                  ? `Sem seleção, o usuário acessa todos os subsetores de ${form.sector}.`
                  : `Sem seleção, o usuário acessa apenas ${form.sector}.`}
              </p>
            )}
          </div>
        </div>

        {topError && (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {topError}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={submitting} className="h-11">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={submitting} className="h-11">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Salvando" : "Salvar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
