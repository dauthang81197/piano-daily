# syntax=docker/dockerfile:1
# Image API — build từ gốc repo: docker build -f apps/api/Dockerfile .
# Dùng cho local (docker-compose.yml) và sau này cho production.

FROM node:24.21-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# 1) Cắt monorepo chỉ còn api + các package nó phụ thuộc.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.5 prune @piano-daily/api --docker

# 2) Cài dependency (layer cache theo lockfile), build, rồi tách bản production.
FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# turbo prune không mang theo file cấu hình gốc dùng chung.
COPY --from=pruner /repo/tsconfig.base.json ./
RUN pnpm turbo run build --filter=@piano-daily/api
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm --filter=@piano-daily/api deploy --prod /prod/api

# 3) Runtime: poppler-utils (pdftoppm) cho pipeline PDF của module media.
FROM node:24.21-bookworm-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
USER node
EXPOSE 4000
# `start` = prisma migrate deploy, rồi mới khởi động app.
CMD ["npm", "start", "--silent"]
