"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { login } from "@/lib/auth/actions";

interface FieldErrors {
  username?: string;
  password?: string;
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!username.trim()) next.username = "Informe seu nome de usuário.";
    if (!password) next.password = "Informe sua senha.";
    return next;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    startTransition(async () => {
      const result = await login({ username: username.trim(), password });
      if (result.ok) {
        router.push("/");
        router.refresh();
      } else {
        setFormError(result.error ?? "Não foi possível entrar.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger">
          {formError}
        </div>
      )}

      <div>
        <Label htmlFor="username">Nome de usuário</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          placeholder="voce#BC"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
          }}
          aria-invalid={Boolean(errors.username)}
          aria-describedby={errors.username ? "username-error" : undefined}
        />
        {errors.username && (
          <p id="username-error" className="mt-1.5 text-xs text-danger">
            {errors.username}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="password">Senha</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        {errors.password && (
          <p id="password-error" className="mt-1.5 text-xs text-danger">
            {errors.password}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="focus-ring rounded text-xs font-medium text-primary transition-colors hover:text-primary-hover"
        >
          Esqueci minha senha
        </button>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Entrando" : "Entrar"}
      </Button>
    </form>
  );
}
