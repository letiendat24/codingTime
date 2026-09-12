-- Phase 11 Practice Center.

ALTER TYPE "LearningActivityType" ADD VALUE IF NOT EXISTS 'PRACTICE_ATTEMPTED';
ALTER TYPE "LearningActivityType" ADD VALUE IF NOT EXISTS 'PRACTICE_SOLVED';

CREATE TYPE "PracticeDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "PracticeProblemStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "PracticeProgressStatus" AS ENUM ('NOT_STARTED', 'ATTEMPTED', 'SOLVED');

CREATE TABLE "practice_problems" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "createdByUserId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "difficulty" "PracticeDifficulty" NOT NULL,
  "status" "PracticeProblemStatus" NOT NULL DEFAULT 'DRAFT',
  "language" TEXT NOT NULL DEFAULT 'javascript',
  "entryFile" TEXT NOT NULL DEFAULT 'index.js',
  "starterFilesJson" JSONB NOT NULL,
  "timeLimitMs" INTEGER NOT NULL DEFAULT 5000,
  "memoryLimitMb" INTEGER NOT NULL DEFAULT 128,
  "passScore" DECIMAL(5,2) NOT NULL DEFAULT 70,
  "scoringMode" "ScoringMode" NOT NULL DEFAULT 'WEIGHTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "practice_problems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_problem_tags" (
  "problemId" UUID NOT NULL,
  "tagId" UUID NOT NULL,
  CONSTRAINT "practice_problem_tags_pkey" PRIMARY KEY ("problemId","tagId")
);

CREATE TABLE "practice_problem_test_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "practiceProblemId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "visibility" "TestCaseVisibility" NOT NULL,
  "input" TEXT NOT NULL,
  "expectedOutput" TEXT NOT NULL,
  "weight" DECIMAL(8,2) NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_problem_test_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studentId" UUID NOT NULL,
  "practiceProblemId" UUID NOT NULL,
  "status" "PracticeProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "bestScore" DECIMAL(5,2),
  "firstAttemptedAt" TIMESTAMP(3),
  "lastAttemptedAt" TIMESTAMP(3),
  "solvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_progress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "judge_submissions" ADD COLUMN "practiceProblemId" UUID;
ALTER TABLE "judge_submissions" ALTER COLUMN "checkpointId" DROP NOT NULL;
ALTER TABLE "judge_submissions" ALTER COLUMN "codingCheckpointConfigId" DROP NOT NULL;

CREATE UNIQUE INDEX "practice_problems_slug_key" ON "practice_problems"("slug");
CREATE INDEX "practice_problems_createdByUserId_status_idx" ON "practice_problems"("createdByUserId", "status");
CREATE INDEX "practice_problems_status_difficulty_idx" ON "practice_problems"("status", "difficulty");
CREATE UNIQUE INDEX "practice_tags_slug_key" ON "practice_tags"("slug");
CREATE UNIQUE INDEX "practice_problem_test_cases_practiceProblemId_position_key" ON "practice_problem_test_cases"("practiceProblemId", "position");
CREATE INDEX "practice_problem_test_cases_practiceProblemId_visibility_idx" ON "practice_problem_test_cases"("practiceProblemId", "visibility");
CREATE UNIQUE INDEX "practice_progress_studentId_practiceProblemId_key" ON "practice_progress"("studentId", "practiceProblemId");
CREATE INDEX "practice_progress_studentId_status_idx" ON "practice_progress"("studentId", "status");
CREATE INDEX "practice_progress_practiceProblemId_idx" ON "practice_progress"("practiceProblemId");
CREATE INDEX "workspaces_practiceProblemId_idx" ON "workspaces"("practiceProblemId");
CREATE UNIQUE INDEX "workspaces_userId_practiceProblemId_key" ON "workspaces"("userId", "practiceProblemId") WHERE "practiceProblemId" IS NOT NULL;
CREATE INDEX "judge_submissions_practiceProblemId_userId_submittedAt_idx" ON "judge_submissions"("practiceProblemId", "userId", "submittedAt");

ALTER TABLE "practice_problems" ADD CONSTRAINT "practice_problems_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practice_problem_tags" ADD CONSTRAINT "practice_problem_tags_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "practice_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_problem_tags" ADD CONSTRAINT "practice_problem_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "practice_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_problem_test_cases" ADD CONSTRAINT "practice_problem_test_cases_practiceProblemId_fkey" FOREIGN KEY ("practiceProblemId") REFERENCES "practice_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_progress" ADD CONSTRAINT "practice_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_progress" ADD CONSTRAINT "practice_progress_practiceProblemId_fkey" FOREIGN KEY ("practiceProblemId") REFERENCES "practice_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_practiceProblemId_fkey" FOREIGN KEY ("practiceProblemId") REFERENCES "practice_problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "judge_submissions" ADD CONSTRAINT "judge_submissions_practiceProblemId_fkey" FOREIGN KEY ("practiceProblemId") REFERENCES "practice_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_practice_context_check"
  CHECK ("practiceProblemId" IS NULL OR ("lessonId" IS NULL AND "checkpointId" IS NULL));

ALTER TABLE "judge_submissions" ADD CONSTRAINT "judge_submissions_exactly_one_target_check"
  CHECK (
    ("checkpointId" IS NOT NULL AND "codingCheckpointConfigId" IS NOT NULL AND "practiceProblemId" IS NULL)
    OR
    ("checkpointId" IS NULL AND "codingCheckpointConfigId" IS NULL AND "practiceProblemId" IS NOT NULL)
  );
