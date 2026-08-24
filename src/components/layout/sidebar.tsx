"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as Icons from "lucide-react";
import { ChevronLeft, ChevronUp, Home, LogOut, Plus } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/permissions";
import {
  GENERAL_LINKS,
  SECTOR_GROUPS,
  STANDALONE_SECTORS,
  slugFromHref,
} from "@/lib/navigation";
import { useRole } from "@/providers/role-provider";
import { useSidebar } from "@/providers/sidebar-provider";
import { useTicketModal } from "@/providers/ticket-modal-provider";
import { useNavigation } from "@/providers/navigation-provider";
import { logout } from "@/lib/auth/actions";
import type { SectorGroup } from "@/types";
import { Logo, LogoMark } from "./logo";
import { NavLink } from "./nav-link";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Cmp ? <Cmp className={className} /> : null;
}

/**
 * `true` apenas quando `open` passou de fechado para aberto DEPOIS da
 * montagem. Serve para rodar a cascata dos subsetores só na abertura de fato —
 * um grupo que já estava aberto ao montar a tela não repete a animação.
 */
function useOpenedByUser(open: boolean): boolean {
  const [animate, setAnimate] = useState(false);
  const previous = useRef(open);

  useEffect(() => {
    if (open && !previous.current) setAnimate(true);
    if (!open) setAnimate(false);
    previous.current = open;
  }, [open]);

  return animate;
}

/**
 * Avatar do usuário logado: foto (.webp) quando existir; senão, iniciais.
 * Recebe o caminho e o nome direto do contexto de sessão.
 */
function SidebarAvatar({ avatarPath, name }: { avatarPath?: string; name: string }) {
  if (avatarPath) {
    return (
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarPath} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
      {initials(name)}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, role, can } = useRole();
  const {
    collapsed,
    toggleCollapsed,
    mobileOpen,
    setMobileOpen,
    openGroups,
    toggleGroup,
    openGroup,
  } = useSidebar();
  const { openModal } = useTicketModal();
  const { pendingHref } = useNavigation();
  const [loggingOut, startLogout] = useTransition();

  // RBAC de conteúdo: `null` = ADMIN (acesso total). Caso contrário, só os
  // slugs liberados no cadastro (ou todos do setor, quando nenhum específico).
  const accessSlugs = user.accessSlugs ?? null;

  const canAccessSlug = useCallback(
    (slug: string | null) => {
      if (slug === null) return true; // link sem subsetor (ex.: /progresso)
      return accessSlugs === null || accessSlugs.includes(slug);
    },
    [accessSlugs],
  );

  // Filtra grupos e itens conforme os subsetores acessíveis. Grupos que
  // ficam sem itens visíveis são removidos por completo.
  const visibleGroups = useMemo<SectorGroup[]>(() => {
    return SECTOR_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessSlug(slugFromHref(item.href))),
    })).filter((group) => group.items.length > 0);
  }, [canAccessSlug]);

  // Standalone (Retaguarda/DHO) são setores transversais, não
  // subsetores de conteúdo. A visibilidade depende só da permissão do papel —
  // não passam pelo filtro de accessSlugs (que é para conteúdo de setor).
  const visibleStandalone = useMemo(() => {
    return STANDALONE_SECTORS.filter((sector) => {
      const href = sector.items[0]?.href;
      if (!href) return false;
      // Sem permissão declarada, cai no filtro de conteúdo por slug.
      if (!sector.permission) return canAccessSlug(slugFromHref(href));
      return can(sector.permission);
    });
  }, [can, canAccessSlug]);

  const hasAnySector = visibleGroups.length > 0 || visibleStandalone.length > 0;

  function handleLogout() {
    setMobileOpen(false);
    startLogout(() => {
      void logout();
    });
  }

  const [popoverGroup, setPopoverGroup] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPopover = useCallback((label: string) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setPopoverGroup(label);
  }, []);

  // Fecha com atraso: dá tempo de o cursor cruzar a lacuna até o painel.
  const schedulePopoverClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPopoverGroup(null), 220);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const isActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  );

  // Entrar por URL direta (ou F5) num subsetor abre o grupo correspondente,
  // em vez de deixar o usuário sem contexto de onde está na árvore.
  useEffect(() => {
    const group = SECTOR_GROUPS.find((g) =>
      g.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
    );
    if (group) openGroup(group.label);
  }, [pathname, openGroup]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface transition-[width,transform] duration-300 ease-smooth",
          collapsed ? "w-sidebar-collapsed" : "w-sidebar",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Cabeçalho com o logo, separado do menu por divisória */}
        <div
          className={cn(
            "flex shrink-0 items-center px-4 py-4 transition-all duration-300 ease-smooth",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <LogoMark className="h-9 w-9" /> : <Logo />}
        </div>

        <div className="relative border-b border-border">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className="focus-ring absolute -right-3 -top-3 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-border-strong hover:text-foreground lg:flex"
          >
            <ChevronLeft
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-300 ease-smooth",
                collapsed && "rotate-180",
              )}
            />
          </button>
        </div>

        <div
          className={cn(
            "px-3 pb-2 pt-3 transition-all duration-300 ease-smooth",
            collapsed && "px-2",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 transition-all duration-300 ease-smooth",
              collapsed && "justify-center p-2",
            )}
          >
            <SidebarAvatar avatarPath={user.avatarPath} name={user.name} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted">
                  {ROLE_LABEL[role]} · {user.sector}
                </p>
              </div>
            )}
          </div>
        </div>

        <nav
          className={cn(
            "scrollbar-slim flex-1 space-y-5 px-3 pb-4",
            // Retraída, o popover precisa escapar da coluna.
            collapsed ? "overflow-visible" : "overflow-y-auto",
          )}
        >
          <NavItem
            href="/"
            label="Início"
            active={pathname === "/"}
            pending={pendingHref === "/"}
            collapsed={collapsed}
            icon={<Home className="h-4 w-4" />}
            onNavigate={() => setMobileOpen(false)}
          />

          <Section title="Geral" collapsed={collapsed}>
            {GENERAL_LINKS.map((link) => (
              <NavItem
                key={link.href}
                href={link.href}
                label={link.label}
                active={isActive(link.href)}
                pending={pendingHref === link.href}
                collapsed={collapsed}
                icon={<Icon name={link.icon} className="h-4 w-4" />}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </Section>

          {hasAnySector && (
            <Section title="Setores" collapsed={collapsed}>
              {visibleGroups.map((group) => (
                <SectorGroupNav
                  key={group.label}
                  group={group}
                  collapsed={collapsed}
                  expanded={openGroups.includes(group.label)}
                  popoverOpen={popoverGroup === group.label}
                  isActive={isActive}
                  pendingHref={pendingHref}
                  onToggle={() =>
                    collapsed
                      ? setPopoverGroup((prev) => (prev === group.label ? null : group.label))
                      : toggleGroup(group.label)
                  }
                  onOpenPopover={() => openPopover(group.label)}
                  onSchedulePopoverClose={schedulePopoverClose}
                  onClosePopover={() => setPopoverGroup(null)}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}

              {visibleStandalone.map((sector) => {
                const href = sector.items[0]?.href ?? "#";
                return (
                  <NavItem
                    key={href}
                    href={href}
                    label={sector.label}
                    active={isActive(href)}
                    pending={pendingHref === href}
                    collapsed={collapsed}
                    icon={<Icon name={sector.icon} className="h-4 w-4" />}
                    onNavigate={() => setMobileOpen(false)}
                  />
                );
              })}
            </Section>
          )}
        </nav>

        <div className={cn("space-y-2 border-t border-border p-3", collapsed && "px-2")}>
          <Button
            className="w-full"
            size={collapsed ? "icon" : "md"}
            aria-label="Abrir chamado"
            onClick={() => {
              setMobileOpen(false);
              openModal();
            }}
          >
            <Plus className="h-4 w-4" />
            {!collapsed && "Abrir Chamado"}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            size={collapsed ? "icon" : "md"}
            aria-label="Sair"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && (loggingOut ? "Saindo" : "Sair")}
          </Button>
        </div>
      </aside>
    </>
  );
}

/**
 * Um setor da barra lateral, com o menu de subsetores animado.
 *
 * Expandido: `Collapse` interpola a altura (grid 0fr→1fr) e os subsetores
 * entram em cascata. Retraído: o mesmo conteúdo aparece num popover lateral
 * com animação de escala/deslocamento.
 */
function SectorGroupNav({
  group,
  collapsed,
  expanded,
  popoverOpen,
  isActive,
  pendingHref,
  onToggle,
  onOpenPopover,
  onSchedulePopoverClose,
  onClosePopover,
  onNavigate,
}: {
  group: SectorGroup;
  collapsed: boolean;
  expanded: boolean;
  popoverOpen: boolean;
  isActive: (href: string) => boolean;
  pendingHref: string | null;
  onToggle: () => void;
  onOpenPopover: () => void;
  onSchedulePopoverClose: () => void;
  onClosePopover: () => void;
  onNavigate: () => void;
}) {
  const hasActiveChild = group.items.some((item) => isActive(item.href));
  // Cascata só quando o usuário abre o menu — não a cada remontagem da tela.
  const cascade = useOpenedByUser(expanded);

  return (
    <div
      className="relative"
      onMouseEnter={() => collapsed && onOpenPopover()}
      onMouseLeave={() => collapsed && onSchedulePopoverClose()}
    >
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => collapsed && onOpenPopover()}
        aria-expanded={collapsed ? popoverOpen : expanded}
        className={cn(
          "focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 hover:bg-surface-2",
          collapsed && "justify-center px-0",
          hasActiveChild || expanded
            ? "font-semibold text-foreground"
            : "font-medium text-muted hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-accent transition-colors duration-200",
            expanded || hasActiveChild ? "bg-accent/20" : "bg-accent/10",
          )}
        >
          <Icon name={group.icon} className="h-4 w-4" />
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{group.label}</span>
            <ChevronUp
              className={cn(
                "h-4 w-4 text-muted transition-transform duration-300 ease-smooth",
                !expanded && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {collapsed && popoverOpen && (
        <div
          className="animate-popover-in absolute left-full top-0 z-50 ml-2 w-56 origin-left rounded-xl border border-border bg-surface p-2 shadow-2xl before:absolute before:-left-2 before:top-0 before:h-full before:w-2 before:content-['']"
          onMouseEnter={onOpenPopover}
          onMouseLeave={onSchedulePopoverClose}
        >
          <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item, index) => (
              <div
                key={item.href}
                className="animate-item-in"
                style={{ animationDelay: `${index * 25}ms` }}
              >
                <NavItem
                  href={item.href}
                  label={item.label}
                  active={isActive(item.href)}
                  pending={pendingHref === item.href}
                  collapsed={false}
                  icon={<Icon name={item.icon} className="h-3.5 w-3.5" />}
                  onNavigate={() => {
                    onClosePopover();
                    onNavigate();
                  }}
                  nested
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!collapsed && (
        <Collapse open={expanded}>
          <div className="ml-[1.4rem] mt-0.5 space-y-0.5 border-l border-border pl-3">
            {group.items.map((item, index) => (
              <div
                key={item.href}
                // A cascata roda só na abertura; ao recolher, nada anima.
                className={cascade ? "animate-item-in" : undefined}
                style={cascade ? { animationDelay: `${index * 30}ms` } : undefined}
              >
                <NavItem
                  href={item.href}
                  label={item.label}
                  active={isActive(item.href)}
                  pending={pendingHref === item.href}
                  collapsed={false}
                  icon={<Icon name={item.icon} className="h-3.5 w-3.5" />}
                  onNavigate={onNavigate}
                  nested
                />
              </div>
            ))}
          </div>
        </Collapse>
      )}
    </div>
  );
}

function Section({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      {collapsed ? (
        // Sem rótulo no modo retraído: a divisória mantém a separação estrutural.
        <div className="mx-2 mb-2 border-t border-border" role="separator" aria-label={title} />
      ) : (
        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
  collapsed,
  nested = false,
  pending = false,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
  /** Destino da navegação em andamento: sinaliza o clique antes da troca. */
  pending?: boolean;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      href={href}
      onNavigate={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring flex items-center gap-3 rounded-lg transition-all duration-200",
        nested ? "px-3 py-2 text-[13px]" : "px-3 py-2.5 text-sm",
        collapsed && "justify-center px-0",
        active
          ? "bg-surface-2 font-semibold text-foreground"
          : "font-medium text-muted hover:bg-surface-2/60 hover:text-foreground",
        pending && !active && "bg-surface-2/60 text-foreground",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md transition-colors duration-200",
          nested ? "h-6 w-6" : "h-7 w-7",
          active || pending ? "bg-primary/15 text-primary" : "bg-accent/10 text-accent",
        )}
      >
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
