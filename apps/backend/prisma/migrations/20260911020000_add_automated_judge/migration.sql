ALTER TYPE "LearningActivityType" ADD VALUE 'CODING_SUBMITTED';
ALTER TYPE "LearningActivityType" ADD VALUE 'CODING_PASSED';

CREATE TYPE "ScoringMode" AS ENUM ('ALL_OR_NOTHING', 'WEIGHTED');
CREATE TYPE "TestCaseVisibility" AS ENUM ('PUBLIC', 'HIDDEN');
CREATE TYPE "JudgeSubmissionStatus" AS ENUM ('QUEUED', 'RUNNING', 'ACCEPTED', 'REJECTED', 'FAILED', 'TIMED_OUT');
CREATE TYPE "TestCaseResultStatus" AS ENUM (
  'PASSED',
  'WRONG_ANSWER',
  'RUNTIME_ERROR',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'INTERNAL_ERROR'
);

ALTER TABLE "coding_checkpoint_configs"
ADD COLUMN "timeLimitMs" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN "memoryLimitMb" INTEGER NOT NULL DEFAULT 128,
ADD COLUMN "passScore" DECIMAL(5,2) NOT NULL DEFAULT 70,
ADD COLUMN "scoringMode" "ScoringMode" NOT NULL DEFAULT 'WEIGHTED';

CREATE TABLE "test_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "codingCheckpointConfigId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "visibility" "TestCaseVisibility" NOT NULL,
  "input" TEXT NOT NULL,
  "expectedOutput" TEXT NOT NULL,
  "weight" DECIMAL(8,2) NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "judge_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "checkpointId" UUID NOT NULL,
  "codingCheckpointConfigId" UUID NOT NULL,
  "language" TEXT NOT NULL,
  "entryFile" TEXT NOT NULL,
  "filesSnapshotJson" JSONB NOT NULL,
  "status" "JudgeSubmissionStatus" NOT NULL DEFAULT 'QUEUED',
  "jobId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "score" DECIMAL(5,2),
  "passed" BOOLEAN,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "judge_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "judge_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "submissionId" UUID NOT NULL,
  "totalScore" DECIMAL(5,2) NOT NULL,
  "maxScore" DECIMAL(5,2) NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "totalTests" INTEGER NOT NULL,
  "passedTests" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "peakMemoryBytes" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "judge_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "test_case_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "judgeResultId" UUID NOT NULL,
  "testCaseId" UUID,
  "displayName" TEXT NOT NULL,
  "visibility" "TestCaseVisibility" NOT NULL,
  "status" "TestCaseResultStatus" NOT NULL,
  "scoreEarned" DECIMAL(8,2) NOT NULL,
  "actualOutput" TEXT,
  "stderr" TEXT,
  "durationMs" INTEGER NOT NULL,
  "memoryBytes" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "test_case_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "test_cases_codingCheckpointConfigId_position_key" ON "test_cases"("codingCheckpointConfigId", "position");
CREATE INDEX "test_cases_codingCheckpointConfigId_visibility_idx" ON "test_cases"("codingCheckpointConfigId", "visibility");
CREATE UNIQUE INDEX "judge_submissions_jobId_key" ON "judge_submissions"("jobId");
CREATE UNIQUE INDEX "judge_submissions_idempotencyKey_key" ON "judge_submissions"("idempotencyKey");
CREATE INDEX "judge_submissions_userId_createdAt_idx" ON "judge_submissions"("userId", "createdAt");
CREATE INDEX "judge_submissions_checkpointId_createdAt_idx" ON "judge_submissions"("checkpointId", "createdAt");
CREATE INDEX "judge_submissions_status_idx" ON "judge_submissions"("status");
CREATE INDEX "judge_submissions_correlationId_idx" ON "judge_submissions"("correlationId");
CREATE UNIQUE INDEX "judge_results_submissionId_key" ON "judge_results"("submissionId");
CREATE UNIQUE INDEX "test_case_results_judgeResultId_testCaseId_key" ON "test_case_results"("judgeResultId", "testCaseId");
CREATE INDEX "test_case_results_judgeResultId_idx" ON "test_case_results"("judgeResultId");
CREATE INDEX "test_case_results_testCaseId_idx" ON "test_case_results"("testCaseId");

ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_codingCheckpointConfigId_fkey"
FOREIGN KEY ("codingCheckpointConfigId") REFERENCES "coding_checkpoint_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "judge_submissions" ADD CONSTRAINT "judge_submissions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "judge_submissions" ADD CONSTRAINT "judge_submissions_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "judge_submissions" ADD CONSTRAINT "judge_submissions_checkpointId_fkey"
FOREIGN KEY ("checkpointId") REFERENCES "video_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "judge_submissions" ADD CONSTRAINT "judge_submissions_codingCheckpointConfigId_fkey"
FOREIGN KEY ("codingCheckpointConfigId") REFERENCES "coding_checkpoint_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "judge_results" ADD CONSTRAINT "judge_results_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "judge_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "test_case_results" ADD CONSTRAINT "test_case_results_judgeResultId_fkey"
FOREIGN KEY ("judgeResultId") REFERENCES "judge_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "test_case_results" ADD CONSTRAINT "test_case_results_testCaseId_fkey"
FOREIGN KEY ("testCaseId") REFERENCES "test_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
