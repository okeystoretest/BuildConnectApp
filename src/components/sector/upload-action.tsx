"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/permission-gate";

export interface UploadActionProps {
  label: string;
  onClick?: () => void;
}

/**
 * Ação de envio de conteúdo. Só existe para quem tem `content.upload`
 * — Colaborador nunca vê o botão.
 */
export function UploadAction({ label, onClick }: UploadActionProps) {
  return (
    <PermissionGate permission="content.upload">
      <Button variant="outline" onClick={onClick}>
        <Upload className="h-4 w-4" />
        {label}
      </Button>
    </PermissionGate>
  );
}
