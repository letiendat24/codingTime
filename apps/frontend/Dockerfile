FROM node:22.13.1-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@11.10.0

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/frontend ./apps/frontend

RUN pnpm install --filter @codesync/frontend... --frozen-lockfile
RUN pnpm --filter @codesync/shared build
RUN pnpm --filter @codesync/frontend build

FROM node:22.13.1-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /app/apps/frontend/public ./apps/frontend/public

EXPOSE 3000

CMD ["node", "apps/frontend/server.js"]
