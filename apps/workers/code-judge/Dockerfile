FROM node:22.13.1-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@11.10.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/workers/code-judge ./apps/workers/code-judge

RUN pnpm install --filter @codesync/worker-code-judge... --frozen-lockfile
RUN pnpm --filter @codesync/shared build
RUN pnpm --filter @codesync/worker-code-judge build

FROM docker:27-cli AS docker-cli

FROM node:22.13.1-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/workers/code-judge/package.json ./apps/workers/code-judge/package.json
COPY --from=build /app/apps/workers/code-judge/node_modules ./apps/workers/code-judge/node_modules
COPY --from=build /app/apps/workers/code-judge/dist ./apps/workers/code-judge/dist

CMD ["node", "apps/workers/code-judge/dist/main.js"]
