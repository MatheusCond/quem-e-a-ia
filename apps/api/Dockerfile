# Imagem da API. O contexto de build é a raiz do monorepo (docker-compose.yml).

# ---- build: instala tudo e compila shared, cloud e api ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cloud/package.json packages/cloud/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @quem/api --workspace @quem/shared --workspace @quem/cloud --no-audit --no-fund
COPY packages/shared packages/shared
COPY packages/cloud packages/cloud
COPY apps/api apps/api
RUN npm run build -w @quem/shared -w @quem/cloud -w @quem/api

# ---- runtime: só dependências de produção e o código compilado ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cloud/package.json packages/cloud/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @quem/api --workspace @quem/shared --workspace @quem/cloud --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/cloud/dist packages/cloud/dist
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
