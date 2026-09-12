FROM node:22.13.1-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/workers/code-execution ./apps/workers/code-execution

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @codesync/shared build
RUN pnpm --filter @codesync/worker-code-execution build

FROM node:22.13.1-alpine

WORKDIR /app

RUN apk add --no-cache docker-cli
RUN corepack enable

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/workers/code-execution ./apps/workers/code-execution

CMD ["node", "apps/workers/code-execution/dist/main.js"]
