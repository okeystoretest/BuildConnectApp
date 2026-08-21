#!/bin/sh
set -e

# Aplica as migrations pendentes antes de subir o servidor.
#
# `migrate deploy` é idempotente: só executa o que ainda não está registrado em
# _prisma_migrations. Se falhar, o container NÃO sobe — melhor ficar fora do ar
# do que servir a aplicação contra um schema desatualizado.

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL não definida. Configure a variável no Easy Panel." >&2
  exit 1
fi

echo "[entrypoint] aplicando migrations…"
npx prisma migrate deploy

# Garante a pasta de uploads (o volume pode ser montado vazio).
mkdir -p "${UPLOADS_DIR:-/var/www/app/uploads}"

echo "[entrypoint] iniciando aplicação…"
exec "$@"
