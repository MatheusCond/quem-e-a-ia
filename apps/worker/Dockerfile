# Imagem do worker. O contexto de build é a raiz do monorepo (docker-compose.yml).

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cloud/package.json packages/cloud/
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace @quem/worker --workspace @quem/shared --workspace @quem/cloud --no-audit --no-fund
COPY packages/shared packages/shared
COPY packages/cloud packages/cloud
COPY apps/worker apps/worker
RUN npm run build -w @quem/shared -w @quem/cloud -w @quem/worker

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cloud/package.json packages/cloud/
COPY apps/worker/package.json apps/worker/
RUN npm ci --omit=dev --workspace @quem/worker --workspace @quem/shared --workspace @quem/cloud --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/cloud/dist packages/cloud/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist
USER node
EXPOSE 3001
CMD ["node", "apps/worker/dist/main.js"]
