FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/workers/video-processing ./apps/workers/video-processing

RUN corepack enable \
  && pnpm install --filter @codesync/worker-video-processing... --prod=false
RUN pnpm --filter @codesync/shared build \
  && pnpm --filter @codesync/worker-video-processing build

WORKDIR /app/apps/workers/video-processing

CMD ["pnpm", "start"]
