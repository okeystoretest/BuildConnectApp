"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/providers/sidebar-provider";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { RoleSwitcher } from "./role-switcher";
import { ThemeToggle } from "./theme-toggle";

export interface TopbarProps {
  eyebrow: string;
  title: string;
}

export function Topbar({ eyebrow, title }: TopbarProps) {
  const { setMobileOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-muted">{eyebrow}</p>
        <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:block">
          <RoleSwitcher />
        </div>
        <ThemeToggle />
        <NotificationBell />
      </div>
    </header>
  );
}
