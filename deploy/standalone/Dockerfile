# Imagem única para hospedagem gratuita: API, worker e front-end num processo.
# O contexto de build é a raiz do monorepo (veja render.yaml).

# ---- build: compila tudo ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cloud/package.json packages/cloud/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @quem/api --workspace @quem/worker --workspace @quem/web \
  --workspace @quem/shared --workspace @quem/cloud --no-audit --no-fund
COPY packages/shared packages/shared
COPY packages/cloud packages/cloud
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY apps/web apps/web
RUN npm run build -w @quem/shared -w @quem/cloud -w @quem/api -w @quem/worker -w @quem/web

# ---- runtime: dependências de produção e o código compilado ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cloud/package.json packages/cloud/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
RUN npm ci --omit=dev --workspace @quem/api --workspace @quem/worker \
  --workspace @quem/shared --workspace @quem/cloud --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/cloud/dist packages/cloud/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY deploy/standalone/start.mjs deploy/standalone/start.mjs
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "deploy/standalone/start.mjs"]
