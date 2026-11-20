FROM node:22.13.1-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@11.10.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/workers/project-grading ./apps/workers/project-grading

RUN pnpm install --filter @codesync/worker-project-grading... --frozen-lockfile
RUN pnpm --filter @codesync/shared build
RUN pnpm --filter @codesync/worker-project-grading build

FROM docker:27-cli AS docker-cli

FROM node:22.13.1-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache git

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/workers/project-grading/package.json ./apps/workers/project-grading/package.json
COPY --from=build /app/apps/workers/project-grading/node_modules ./apps/workers/project-grading/node_modules
COPY --from=build /app/apps/workers/project-grading/dist ./apps/workers/project-grading/dist

CMD ["node", "apps/workers/project-grading/dist/main.js"]
