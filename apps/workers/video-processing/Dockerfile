FROM node:22.13.1-bookworm-slim AS build

WORKDIR /app

RUN npm install -g pnpm@11.10.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/workers/video-processing ./apps/workers/video-processing

RUN pnpm install --filter @codesync/worker-video-processing... --frozen-lockfile
RUN pnpm --filter @codesync/shared build
RUN pnpm --filter @codesync/worker-video-processing build

FROM node:22.13.1-bookworm-slim AS runtime

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/workers/video-processing/package.json ./apps/workers/video-processing/package.json
COPY --from=build /app/apps/workers/video-processing/node_modules ./apps/workers/video-processing/node_modules
COPY --from=build /app/apps/workers/video-processing/dist ./apps/workers/video-processing/dist

WORKDIR /app/apps/workers/video-processing

CMD ["node", "dist/main.js"]
