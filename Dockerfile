# Build.Connect — imagem de produção (Easy Panel / Docker)
#
# Base Debian slim, não Alpine: `sharp` e os engines do Prisma têm binários
# prontos para glibc. Em Alpine (musl) os dois exigem compilação ou variantes
# extras — troca alguns MB de imagem por uma classe inteira de erro no deploy.
#
# Uma única etapa, de propósito: o mesmo `node_modules` que compila também
# roda as migrations (`prisma`) e os scripts de manutenção (`tsx`) pelo console
# do Easy Panel. Com o disco de 1 TB da VPS, previsibilidade vale mais que
# economizar imagem.

FROM node:20-bookworm-slim

# openssl é requisito do engine do Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Dependências primeiro: enquanto package-lock.json não mudar, o Docker
# reaproveita esta camada e o build fica em segundos.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Client do Prisma gerado a partir do schema já copiado.
RUN npx prisma generate

COPY . .

RUN npm run build

# Ponto de montagem do volume persistente. TEM de ser volume: o que ficar
# dentro da imagem some no próximo deploy.
RUN mkdir -p /var/www/app/uploads
ENV UPLOADS_DIR=/var/www/app/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Runtime sem root. A imagem base já traz o usuário "node" (uid 1000); build,
# npm ci e prisma generate rodam como root acima, e só o processo servido cai
# de privilégio. /app precisa ser gravável pelo cache do next start.
#
# ATENÇÃO NO DEPLOY: o volume montado em /var/www/app/uploads precisa pertencer
# ao uid 1000 — "chown -R 1000:1000" no volume. O entrypoint verifica e falha
# com mensagem clara se não estiver.
RUN chown -R node:node /app /var/www/app
USER node

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
