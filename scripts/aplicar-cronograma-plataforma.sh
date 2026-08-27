#!/usr/bin/env bash
#
# Build.Connect — migration da rede social no Cronograma.
#
# Rode DEPOIS do deploy, no terminal do serviço `build-connect`, a partir da
# raiz do app:
#
#   bash scripts/aplicar-cronograma-plataforma.sh
#
# O que ele faz:
#   1. confere DATABASE_URL e a presença da migration;
#   2. mostra o que está pendente (`migrate status`);
#   3. aplica (`migrate deploy`);
#   4. confere no banco que o enum e a coluna existem.
#
# Observação: o `docker-entrypoint.sh` já roda `migrate deploy` a cada start do
# container, então normalmente a migration entra sozinha no deploy. Este script
# serve para aplicar na hora, sem reiniciar, e para conferir o resultado.
#
# Seguro para rodar mais de uma vez: `migrate deploy` só aplica o que falta.

set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; BOLD=$'\033[1m'; OFF=$'\033[0m'

step() { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$OFF"; }
ok()   { printf '%s  ✓ %s%s\n' "$GREEN" "$1" "$OFF"; }
die()  { printf '%s  ✗ %s%s\n' "$RED" "$1" "$OFF" >&2; exit 1; }

MIGRATION="prisma/migrations/20260827120000_content_platform/migration.sql"

# ── 1. Pré-requisitos ────────────────────────────────────────

step "Verificando ambiente"

[ -f package.json ] || die "Rode a partir da raiz do app (onde está o package.json)."
[ -f "$MIGRATION" ] || die "$MIGRATION não encontrada — o deploy do pacote subiu?"
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL não está definida neste shell."

ok "Migration presente"
ok "DATABASE_URL definida"

# ── 2. Estado atual ──────────────────────────────────────────

step "Migrations pendentes"

npx prisma migrate status || true

# ── 3. Aplicação ─────────────────────────────────────────────

step "Aplicando"

npx prisma migrate deploy

# ── 4. Conferência ───────────────────────────────────────────

step "Conferindo no banco"

# Arquivo temporário DENTRO de /app: o Node resolve node_modules subindo a
# partir da pasta do arquivo — em /tmp não acharia o @prisma/client.
VERIFICA="./.bc-verifica-plataforma-$$.ts"
trap 'rm -f "$VERIFICA"' EXIT

cat > "$VERIFICA" <<'TS'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const coluna = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ContentPost' AND column_name = 'platform'`,
  );
  const valores = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT e.enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ContentPlatform'
      ORDER BY e.enumsortorder`,
  );

  console.log(`  Coluna ContentPost.platform: ${coluna.length === 1 ? "ok" : "AUSENTE"}`);
  console.log(`  Enum ContentPlatform: ${valores.map((v) => v.enumlabel).join(", ") || "AUSENTE"}`);

  if (coluna.length !== 1 || valores.length !== 3) {
    console.error("  Migration NAO aplicada por completo.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
TS

npx tsx "$VERIFICA"

step "Pronto"
printf '  O formulário "Novo conteúdo" agora traz Instagram, TikTok e YouTube\n'
printf '  como escolha opcional de rede social, e o ícone aparece no card do\n'
printf '  calendário, no backlog, nos detalhes e na exportação em CSV.\n'
printf '\n  Para apagar as notificações do banco:\n'
printf '    psql "$DATABASE_URL" -f scripts/limpar-notificacoes.sql\n\n'
