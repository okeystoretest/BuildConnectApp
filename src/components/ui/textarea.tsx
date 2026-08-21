"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(
      "focus-ring w-full resize-y rounded-xl border border-border bg-surface-2 p-3 text-sm text-foreground placeholder:text-muted/70 transition-colors hover:border-border-strong",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
