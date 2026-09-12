CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

CREATE TABLE "coding_checkpoint_configs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "checkpointId" uuid NOT NULL,
  "language" text NOT NULL,
  "entryFile" text NOT NULL,
  "starterFilesJson" jsonb NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,

  CONSTRAINT "coding_checkpoint_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspaces" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "lessonId" uuid,
  "checkpointId" uuid,
  "practiceProblemId" uuid,
  "language" text NOT NULL,
  "entryFile" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  "lastOpenedAt" timestamp(3),

  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_files" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "path" text NOT NULL,
  "content" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,

  CONSTRAINT "workspace_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execution_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "language" text NOT NULL,
  "entryFile" text NOT NULL,
  "filesSnapshotJson" jsonb NOT NULL,
  "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "jobId" text NOT NULL,
  "idempotencyKey" text NOT NULL,
  "correlationId" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "queuedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" timestamp(3),
  "completedAt" timestamp(3),
  "failedAt" timestamp(3),

  CONSTRAINT "execution_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execution_results" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "executionRequestId" uuid NOT NULL,
  "exitCode" integer,
  "stdout" text NOT NULL,
  "stderr" text NOT NULL,
  "durationMs" integer NOT NULL,
  "memoryBytes" bigint,
  "errorCode" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "execution_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coding_checkpoint_configs_checkpointId_key" ON "coding_checkpoint_configs"("checkpointId");
CREATE UNIQUE INDEX "workspaces_userId_checkpointId_key" ON "workspaces"("userId", "checkpointId");
CREATE INDEX "workspaces_userId_idx" ON "workspaces"("userId");
CREATE INDEX "workspaces_lessonId_idx" ON "workspaces"("lessonId");
CREATE INDEX "workspaces_checkpointId_idx" ON "workspaces"("checkpointId");
CREATE UNIQUE INDEX "workspace_files_workspaceId_path_key" ON "workspace_files"("workspaceId", "path");
CREATE INDEX "workspace_files_workspaceId_idx" ON "workspace_files"("workspaceId");
CREATE UNIQUE INDEX "execution_requests_jobId_key" ON "execution_requests"("jobId");
CREATE UNIQUE INDEX "execution_requests_idempotencyKey_key" ON "execution_requests"("idempotencyKey");
CREATE INDEX "execution_requests_workspaceId_createdAt_idx" ON "execution_requests"("workspaceId", "createdAt");
CREATE INDEX "execution_requests_userId_status_idx" ON "execution_requests"("userId", "status");
CREATE INDEX "execution_requests_correlationId_idx" ON "execution_requests"("correlationId");
CREATE UNIQUE INDEX "execution_results_executionRequestId_key" ON "execution_results"("executionRequestId");

ALTER TABLE "coding_checkpoint_configs"
  ADD CONSTRAINT "coding_checkpoint_configs_checkpointId_fkey"
  FOREIGN KEY ("checkpointId") REFERENCES "video_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_checkpointId_fkey"
  FOREIGN KEY ("checkpointId") REFERENCES "video_checkpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspace_files"
  ADD CONSTRAINT "workspace_files_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "execution_requests"
  ADD CONSTRAINT "execution_requests_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "execution_requests"
  ADD CONSTRAINT "execution_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "execution_results"
  ADD CONSTRAINT "execution_results_executionRequestId_fkey"
  FOREIGN KEY ("executionRequestId") REFERENCES "execution_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
