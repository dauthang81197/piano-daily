# syntax=docker/dockerfile:1
# Image admin (Next standalone) — build từ gốc repo: docker build -f apps/admin/Dockerfile .

FROM node:24.21-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.5 prune @piano-daily/admin --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# turbo prune không mang theo file cấu hình gốc dùng chung.
COPY --from=pruner /repo/tsconfig.base.json ./
# URL API mà trình duyệt gọi: `NEXT_PUBLIC_*` được Next inline vào bundle lúc build, nên phải có ở bước build
# (compose truyền qua `build.args`). Đổi URL thì phải build lại image.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# URL gốc công khai của web: admin mở trang xem trước Sheet Draft tới đây (Story 2.10).
ARG NEXT_PUBLIC_SITE_URL=http://localhost:4100
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN pnpm turbo run build --filter=@piano-daily/admin

FROM node:24.21-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4101 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=node:node /repo/apps/admin/public ./apps/admin/public
USER node
EXPOSE 4101
CMD ["node", "apps/admin/server.js"]
