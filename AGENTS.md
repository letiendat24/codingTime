# CodeSync — Agent Instructions

This file contains mandatory instructions for AI coding agents working on the CodeSync repository.

These rules apply to every task unless a phase specification explicitly overrides them.

---

# 1. Read Project Context First

Before modifying the repository, read the relevant project documentation:

1. `docs/ARCHITECTURE.md`
2. `docs/DEVELOPMENT_RULES.md`
3. `docs/DOMAIN_MODEL.md`
4. `docs/FUNCTIONAL_REQUIREMENTS.md`
5. `docs/ROADMAP.md`
6. `docs/TECHNICAL_DEBT.md`

When implementing a phase, also read its specification under:

`docs/agent/phases/`

Do not infer architecture from directory names alone.

Existing project decisions take priority over generic framework conventions.

---

# 2. Project Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* TanStack Query
* HLS.js

## Backend

* Node.js
* Express.js
* TypeScript
* Prisma
* PostgreSQL
* Zod
* Pino

## Infrastructure

* PostgreSQL
* Redis
* RabbitMQ
* MinIO / S3-compatible storage
* Docker
* Docker Compose
* FFmpeg

## Workers

Workers are independent Node.js + TypeScript processes.

Current workers include:

* `apps/workers/video-processing`
* `apps/workers/code-execution`
* `apps/workers/project-grading`

---

# 3. Repository Structure

Main applications:

```text
apps/
├── frontend/
├── backend/
└── workers/
```

Shared packages:

```text
packages/
├── shared/
└── config/
```

Infrastructure:

```text
infra/
```

Documentation:

```text
docs/
```

Do not rename or reorganize major directories unless explicitly required.

---

# 4. Backend Architecture

CodeSync backend is a Modular Monolith with separate asynchronous workers.

The normal synchronous request flow is:

```text
Route
→ Controller
→ Service / Use Case
→ Repository
→ Prisma
→ PostgreSQL
```

Responsibilities:

## Routes

Routes define:

* URL
* HTTP method
* middleware
* controller binding

Routes must not contain business logic.

## Controllers

Controllers handle HTTP transport concerns.

Controllers may:

* read validated request input
* call services/use cases
* return HTTP responses

Controllers must not:

* execute database queries directly
* contain domain rules
* perform long-running work
* execute user code
* invoke FFmpeg

## Services / Use Cases

Services own:

* application workflows
* domain rules
* transactions
* coordination with repositories/infrastructure

## Repositories

Repositories own persistence access.

Prisma/database logic should not leak through controllers.

---

# 5. Do Not Introduce NestJS

The backend framework is:

Node.js + Express.js + TypeScript.

Do not introduce NestJS unless an explicit future architecture decision changes the backend framework.

---

# 6. Database Rules

PostgreSQL is the durable source of truth.

Do not use Redis as the primary persistence layer for:

* users
* sessions
* courses
* enrollments
* learning progress
* video progress
* checkpoints
* submissions
* execution state that users must inspect
* grading state

Use Prisma migrations for schema changes.

Never modify an already-applied migration.

Create a new migration for every schema evolution.

Use database constraints to protect important invariants where practical.

Examples:

* uniqueness
* ownership relationships
* idempotency
* ordering

---

# 7. Redis Rules

Redis may be used for:

* caching
* rate limiting
* short-lived coordination
* ephemeral state
* distributed locks when genuinely necessary

Redis must not replace PostgreSQL as the durable business source of truth.

Every cache must have:

* TTL
  or
* explicit invalidation strategy

Do not introduce Redis merely because it exists in the stack.

---

# 8. RabbitMQ Rules

RabbitMQ is for asynchronous or expensive workloads.

Good use cases:

* video processing
* code execution
* automated judging
* project grading
* notification fanout
* future analytics ingestion

Do not use RabbitMQ for normal transactional CRUD.

Examples that should remain synchronous:

* create course
* enroll student
* update learning progress
* update video watch position
* read code snapshots

RabbitMQ architecture follows:

```text
Exchange
→ Routing Key
→ Queue
→ Consumer Worker
```

Event/routing key and queue name are different concepts.

---

# 9. Async Message Contract

Use the shared async envelope from `packages/shared`.

Async jobs must contain:

```text
jobId
idempotencyKey
correlationId
requestedByUserId
createdAt
payload
```

Do not put entire database entities inside queue messages.

Messages should contain only the information required to identify and process the job.

HTTP correlation IDs must propagate into asynchronous jobs whenever possible.

Example:

```text
HTTP Request
correlationId=abc

→ Backend
→ RabbitMQ
→ Worker
→ Result Event
→ Backend Consumer

correlationId=abc
```

This allows tracing a workflow across processes.

---

# 10. Worker Rules

Long-running, CPU-heavy, or unsafe workloads belong in workers.

Workers must:

* support horizontal scaling
* handle duplicate message delivery
* implement idempotency
* use structured logging
* propagate correlation IDs
* distinguish retryable/non-retryable errors
* clean temporary resources
* acknowledge RabbitMQ messages only after safe processing

Workers should publish result events rather than becoming owners of application business state.

Preferred architecture:

```text
Backend
→ Job Event
→ RabbitMQ
→ Worker
→ Result Event
→ Backend Consumer
→ PostgreSQL
```

---

# 11. User Code Is Untrusted

All code supplied by users must be considered malicious/untrusted.

Never execute user code:

* inside Express backend
* inside the worker host process directly
* using unrestricted child processes

User code must eventually execute inside an isolated sandbox with enforced limits.

Required limits include:

* execution time
* CPU
* memory
* process count
* filesystem
* network
* output size

Likewise, user-submitted GitHub repositories are untrusted.

---

# 12. Video Architecture

Large videos upload directly:

```text
Browser
→ Presigned Upload
→ MinIO/S3
```

Video bytes must not pass through Express.

Processing architecture:

```text
Object Storage
→ RabbitMQ
→ Video Worker
→ FFmpeg
→ HLS
→ Object Storage
```

FFmpeg must never run inside an HTTP request.

---

# 13. Authentication & Security

Existing authentication uses:

* Argon2id password hashing
* short-lived access tokens
* refresh tokens
* HTTP-only refresh cookie
* PostgreSQL sessions
* refresh-token rotation
* role foundation
* rate limiting

Never log:

* passwords
* access tokens
* refresh tokens
* cookies
* signed URLs
* secrets
* private repository credentials

Do not weaken existing authentication behavior while implementing unrelated phases.

Known browser access-token hardening remains tracked in `docs/TECHNICAL_DEBT.md`.

---

# 14. Authorization

Backend authorization is authoritative.

Never rely on frontend role checks for security.

Always verify:

* authenticated user
* required role
* resource ownership
* enrollment/access relationship where required

An authenticated ID supplied by the client must not override the identity in the authenticated request context.

---

# 15. Input Validation

Use Zod for request and configuration validation.

Validate:

* body
* query
* route parameters
* environment configuration
* external worker messages

Do not trust frontend input.

Do not expose raw:

* Prisma errors
* SQL errors
* worker stack traces
* filesystem paths

---

# 16. API Error Format

Keep API errors consistent.

Preferred format:

```json
{
  "error": {
    "code": "DOMAIN_ERROR_CODE",
    "message": "Safe public message"
  },
  "requestId": "..."
}
```

Optional details may be included when safe.

Never expose stack traces to API clients.

---

# 17. Pagination

Use the existing pagination contract:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

Do not introduce a different pagination shape without a deliberate migration.

---

# 18. Logging

Use structured Pino logs.

Important workflows should contain relevant identifiers such as:

```text
requestId
correlationId
jobId
userId
videoAssetId
executionId
submissionId
```

Never log source code contents unnecessarily.

Avoid noisy logs for high-frequency progress events.

---

# 19. Frontend Rules

Frontend uses Next.js + TypeScript.

Use TanStack Query for server state when appropriate.

Do not duplicate backend business rules in frontend.

Frontend validation improves UX but is not security.

Keep API URL centralized through project configuration.

Do not introduce hardcoded backend URLs across pages.

Use the frontend design-system foundation for shared UI:

* semantic colors from `app/globals.css` and Tailwind tokens
* reusable components from `apps/frontend/design-system`
* consistent loading, error, and empty states
* status badges backed by semantic tones

Support Light, Dark, and System themes through `ThemeProvider`.

Support Vietnamese and English text through `I18nProvider` and message files. Do not add new user-facing strings to core screens without considering localization.

Keep server-state cache keys centralized in `apps/frontend/lib/query/keys.ts` when adding or touching TanStack Query usage.

Preserve feature ownership boundaries under `apps/frontend/features/*` and do not create duplicate frontend pipelines for code execution, judge, project grading, video learning, practice, or notifications.

The Video-Code Sync learning experience is a priority surface. Instructor timeline/code state may guide the learner, but student workspace code must remain independent and must never be overwritten automatically.

---

# 20. Avoid Premature Complexity

Do not introduce unless explicitly requested:

* microservices
* Kubernetes
* Kafka
* Elasticsearch
* service discovery
* event sourcing
* CQRS framework
* generic repository frameworks

CodeSync intentionally starts simple and extracts services only when justified.

---

# 21. Do Not Create Fake Abstractions

Do not add:

* BaseController
* BaseService
* generic CRUD repository
* empty business modules
* wrapper classes with no actual responsibility

Prefer explicit code.

---

# 22. Scope Discipline

Implement only the requested phase/task.

Do not automatically continue into another phase.

Do not implement future functionality "while already here".

If a future requirement needs a small extension point, create only the minimum boundary necessary.

---

# 23. Existing Features Must Not Regress

Previous phases are considered completed functionality.

When implementing new phases, preserve:

* authentication
* session rotation
* course management
* enrollment
* learning progress
* learning history
* video upload/processing/HLS
* interactive video progress
* checkpoints
* code snapshots

Run regression tests.

---

# 24. Required Verification

Before completing a coding task, run as applicable:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

If database schema changed:

```bash
pnpm db:migrate
```

Infrastructure when needed:

```bash
pnpm infra:up
```

Do not claim success for commands that were not actually run.

If a verification command cannot be run, report why.

---

# 25. Documentation

When architecture/domain behavior changes, update the relevant:

* `docs/ARCHITECTURE.md`
* `docs/DOMAIN_MODEL.md`
* `docs/FUNCTIONAL_REQUIREMENTS.md`
* `docs/DEVELOPMENT_RULES.md`
* `docs/ROADMAP.md`
* `docs/TECHNICAL_DEBT.md`
* `README.md`

Avoid rewriting unrelated documentation.

---

# 26. Completion Behavior

At the end of a task:

1. Run required verification.
2. Summarize what changed.
3. Report migrations/endpoints/queues if relevant.
4. Report test/lint/typecheck/build results.
5. Report deferred technical debt.
6. STOP.

Do not automatically start the next phase.
