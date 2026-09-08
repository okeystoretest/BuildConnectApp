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

# O teste é um mkdir ANINHADO de verdade, não um `[ -w ]` na raiz.
#
# O `[ -w "$UPLOADS_PATH" ]` que estava aqui deu sinal verde para um volume em
# que a aplicação não gravava em pasta alguma: a RAIZ estava 777, então o teste
# passou, mas as subpastas criadas antes do `USER node` do Dockerfile eram
# root:root 755 e o uid 1000 não conseguia criar nada dentro delas. O container
# subiu normal e a falha só apareceu no primeiro upload, como
# "EACCES: mkdir '/var/www/app/uploads/avatares/2026/09'" — na tela do usuário,
# "Falha ao processar a foto", num JPEG de 44 KB.
#
# É exatamente o que a aplicação faz em runtime: `storeFile` particiona por
# ano/mês e cria dois níveis. Testar um nível a menos é testar outra coisa.
PROBE_DIR="$UPLOADS_PATH/.entrypoint-probe/nivel2"
if ! mkdir -p "$PROBE_DIR" 2>/dev/null; then
  echo "[entrypoint] sem permissão para criar subpastas em $UPLOADS_PATH." >&2
  echo "[entrypoint] O processo roda como uid 1000 (node). Ajuste o dono do volume:" >&2
  echo "[entrypoint]   chown -R 1000:1000 <caminho do volume no host>" >&2
  echo "[entrypoint] Atenção: a raiz do volume pode estar gravável e as" >&2
  echo "[entrypoint] subpastas não — é por isso que o teste cria dois níveis." >&2
  exit 1
fi
# Limpeza best-effort: deixar a sonda para trás não quebra nada, e falhar em
# removê-la não é motivo para não subir.
rmdir "$PROBE_DIR" "$UPLOADS_PATH/.entrypoint-probe" 2>/dev/null || true

echo "[entrypoint] iniciando aplicação…"
exec "$@"
