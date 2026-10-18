# Multi-stage Dockerfile for @chat/server
FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@12.14.0

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

RUN pnpm approve-builds --all
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @chat/database run db:generate
RUN pnpm --filter @chat/server run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@12.14.0

COPY --from=builder /app /app

EXPOSE 4000
CMD ["pnpm", "--filter", "@chat/server", "run", "start"]
