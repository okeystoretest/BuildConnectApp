#!/usr/bin/env bash
#
# Build.Connect — migration do vídeo de boas-vindas por setor.
#
# Rode DEPOIS do deploy, no terminal do serviço `build-connect`, a partir da
# raiz do app:
#
#   bash scripts/aplicar-video-boas-vindas.sh
#
# O que ele faz:
#   1. confere DATABASE_URL e a presença da migration;
#   2. mostra o que está pendente (`migrate status`);
#   3. aplica (`migrate deploy`);
#   4. confere no banco que as colunas e a tabela existem.
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

MIGRATION="prisma/migrations/20260826210000_sector_welcome_video/migration.sql"

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

VERIFICA="$(mktemp -t bc-verifica-video-XXXXXX.ts)"
trap 'rm -f "$VERIFICA"' EXIT

cat > "$VERIFICA" <<'TS'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const colunas = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Subsector'
        AND column_name IN ('welcomeVideoPath','welcomeVideoTitle','welcomeVideoAt')`,
  );
  const tabela = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_name = 'SubsectorWelcomeView'`,
  );

  console.log(`  Colunas em Subsector: ${colunas.length}/3`);
  console.log(`  Tabela SubsectorWelcomeView: ${tabela.length === 1 ? "ok" : "AUSENTE"}`);

  if (colunas.length !== 3 || tabela.length !== 1) {
    console.error("  Migration NAO aplicada por completo.");
    process.exit(1);
  }

  const setores = await prisma.subsector.count();
  console.log(`  ${setores} setores prontos para receber video.`);
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
printf '  Cada setor agora tem o card "Vídeo de boas-vindas do setor",\n'
printf '  logo abaixo do cabeçalho, visível para Gestor e Admin.\n\n'
