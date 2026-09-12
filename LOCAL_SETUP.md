# CodeSync Local Setup

Huong dan nay giup chay CodeSync tren may local sau khi clone repository.

## Prerequisites

- Node.js `22.13+`
- pnpm `11+`
- Docker Desktop hoac Docker Engine co Docker Compose
- FFmpeg/FFprobe neu can chay video worker tren host
- Docker socket access neu can chay code execution, automated judge, hoac project grading workers

## 1. Install Dependencies

```sh
pnpm install
```

## 2. Create Environment File

```sh
cp .env.example .env
```

Mac/Linux co the dung mac dinh trong `.env.example` cho local development.

Quan trong:

- `DATABASE_URL`
- `REDIS_URL`
- `RABBITMQ_URL`
- `MINIO_*`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `NEXT_PUBLIC_API_URL`

Khong commit file `.env`.

## 3. Start Local Infrastructure

```sh
pnpm infra:up
```

Docker Compose se chay:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- RabbitMQ: `localhost:5672`
- RabbitMQ Management UI: `http://localhost:15672`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

`pnpm infra:up` cung tao bucket MinIO local theo bien `MINIO_BUCKET`.

## 4. Prepare Database

```sh
pnpm db:migrate
pnpm db:seed
```

Seed hien tai tao role va reference data can thiet. Public registration tao user role `STUDENT`.

## 5. Run Applications

Terminal 1:

```sh
pnpm dev:backend
```

Backend mac dinh chay tai:

```text
http://localhost:4000/api/v1
```

Terminal 2:

```sh
pnpm dev:frontend
```

Frontend mac dinh chay tai:

```text
http://localhost:3000
```

## 6. Optional Workers

Chi chay worker khi can test flow lien quan.

Video processing:

```sh
pnpm --filter @codesync/worker-video-processing dev
```

Code execution:

```sh
pnpm --filter @codesync/worker-code-execution dev
```

Automated judge:

```sh
pnpm --filter @codesync/worker-code-judge dev
```

Project grading:

```sh
pnpm --filter @codesync/worker-project-grading dev
```

Docker Compose cung co worker profiles neu muon chay worker trong container:

```sh
docker compose -f infra/docker/docker-compose.yml --profile workers up -d video-worker
docker compose -f infra/docker/docker-compose.yml --profile workers up -d code-worker
docker compose -f infra/docker/docker-compose.yml --profile workers up -d code-judge-worker
docker compose -f infra/docker/docker-compose.yml --profile workers up -d project-grading-worker
```

## 7. Verify

Health:

```sh
curl -i http://localhost:4000/api/v1/health
```

Readiness:

```sh
curl -i http://localhost:4000/api/v1/ready
```

Frontend:

```sh
curl -i http://localhost:3000
```

Expected:

- `/health` tra ve `200`
- `/ready` tra ve `200` khi PostgreSQL, Redis, RabbitMQ, va MinIO san sang
- Frontend tra ve `200`

## 8. Quality Checks

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Neu `pnpm test` can database test, hay dam bao infrastructure dang chay.

## 9. Useful Commands

```sh
pnpm infra:up
pnpm infra:down
pnpm dev:backend
pnpm dev:frontend
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## 10. Troubleshooting

Neu frontend gap CORS:

- Kiem tra `CORS_ORIGIN=http://localhost:3000`
- Kiem tra frontend dang dung `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`
- Restart backend sau khi sua `.env`

Neu `/ready` fail:

- Chay lai `pnpm infra:up`
- Kiem tra container bang `docker ps`
- Kiem tra `.env` co dung port local khong

Neu Prisma khong ket noi database:

- Kiem tra `DATABASE_URL`
- Dam bao PostgreSQL healthy
- Chay lai `pnpm db:migrate`

Neu code execution/judge/project grading fail:

- Dam bao Docker dang chay
- Dam bao worker tuong ung dang chay
- Kiem tra `DOCKER_SOCKET_PATH`

## Notes For Git

Thu muc `docs/` duoc ignore de tranh day cac tai lieu noi bo/agent docs len GitHub.

File nay nam o root nen van nen duoc commit:

```text
LOCAL_SETUP.md
```

Neu `docs/` da tung duoc Git track truoc do, can bo khoi index mot lan:

```sh
git rm --cached -r docs
```
