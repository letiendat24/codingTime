FROM node:22.13.1-alpine AS build

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig.node.json packages/config/tsconfig.node.json
COPY packages/config/tsconfig.base.json packages/config/tsconfig.base.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY apps/workers/code-judge/package.json apps/workers/code-judge/package.json

RUN pnpm install --filter @codesync/worker-code-judge... --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/workers/code-judge apps/workers/code-judge

RUN pnpm --filter @codesync/shared build
RUN pnpm --filter @codesync/worker-code-judge build

FROM node:22.13.1-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache docker-cli

COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/packages/shared /workspace/packages/shared
COPY --from=build /workspace/apps/workers/code-judge/dist /app/dist
COPY --from=build /workspace/apps/workers/code-judge/package.json /app/package.json

CMD ["node", "dist/main.js"]
