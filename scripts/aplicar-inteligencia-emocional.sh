#!/usr/bin/env bash
#
# Build.Connect — publica a Avaliação Multidirecional de Inteligência Emocional.
#
# Rode DEPOIS do deploy, no terminal do serviço `build-connect`, a partir da
# raiz do app:
#
#   bash scripts/aplicar-inteligencia-emocional.sh
#
# O que ele faz:
#   1. confere que está na raiz do app e que DATABASE_URL existe;
#   2. roda o seed cirúrgico do instrumento;
#   3. confere no banco que as 2 seções e os 18 critérios estão lá.
#
# NÃO há migration nesta entrega: o valor INTELIGENCIA_EMOCIONAL já existe no
# enum EvaluationKind desde a migration 20260727140000_evaluations_foundation.
#
# Seguro para rodar mais de uma vez: se o instrumento já tiver respostas
# gravadas, o seed preserva as perguntas e não altera nada.

set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; BOLD=$'\033[1m'; OFF=$'\033[0m'

step() { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$OFF"; }
ok()   { printf '%s  ✓ %s%s\n' "$GREEN" "$1" "$OFF"; }
die()  { printf '%s  ✗ %s%s\n' "$RED" "$1" "$OFF" >&2; exit 1; }

SEED="scripts/seed-inteligencia-emocional.ts"

# ── 1. Pré-requisitos ────────────────────────────────────────

step "Verificando ambiente"

[ -f package.json ] || die "Rode a partir da raiz do app (onde está o package.json)."
[ -f "$SEED" ] || die "$SEED não encontrado — o deploy do pacote subiu?"
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL não está definida neste shell."

ok "Seed presente"
ok "DATABASE_URL definida"

# ── 2. Seed do instrumento ───────────────────────────────────

step "Cadastrando as perguntas"

npx tsx "$SEED"

# ── 3. Conferência ───────────────────────────────────────────

step "Conferindo no banco"

# Arquivo temporário DENTRO de /app: o Node resolve node_modules subindo a
# partir da pasta do arquivo — em /tmp não acharia o @prisma/client.
VERIFICA="./.bc-verifica-ie-$$.ts"
trap 'rm -f "$VERIFICA"' EXIT

cat > "$VERIFICA" <<'TS'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const type = await prisma.evaluationType.findUnique({
    where: { slug: "inteligencia-emocional" },
    include: { sections: { orderBy: { order: "asc" }, include: { questions: true } } },
  });

  if (!type) {
    console.error("  Instrumento inteligencia-emocional AUSENTE.");
    process.exit(1);
  }

  const total = type.sections.reduce((n, s) => n + s.questions.length, 0);
  console.log(`  ${type.title}`);
  console.log(`  Escala 1-${type.scaleMax}, ${type.sections.length} secoes, ${total} criterios`);
  for (const s of type.sections) {
    console.log(`    - ${s.title}: ${s.questions.length}`);
  }

  if (type.sections.length !== 2 || total !== 18) {
    console.error("  Cadastro incompleto.");
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
printf '  A Inteligência Emocional entra como avaliação MULTIAVALIADOR:\n'
printf '  o DHO abre a rodada, define quantos avaliam e designa cada um;\n'
printf '  o último da fila é sempre o próprio avaliado (autoavaliação).\n\n'
