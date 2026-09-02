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

# Garante a pasta de uploads (o volume pode ser montado vazio) e confirma que
# dá para escrever nela. O container roda como usuário "node" (uid 1000): um
# volume que chega com dono root faria TODO upload falhar em runtime, um a um,
# sem nada nos logs de subida. Melhor não subir e dizer por quê.
UPLOADS_PATH="${UPLOADS_DIR:-/var/www/app/uploads}"
mkdir -p "$UPLOADS_PATH" 2>/dev/null || true

if [ ! -w "$UPLOADS_PATH" ]; then
  echo "[entrypoint] sem permissão de escrita em $UPLOADS_PATH." >&2
  echo "[entrypoint] O processo roda como uid 1000 (node). Ajuste o dono do volume:" >&2
  echo "[entrypoint]   chown -R 1000:1000 <caminho do volume no host>" >&2
  exit 1
fi

echo "[entrypoint] iniciando aplicação…"
exec "$@"
