ALTER TYPE "LearningActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_SUBMITTED';
ALTER TYPE "LearningActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_PASSED';

CREATE TYPE "RepositoryProvider" AS ENUM ('GITHUB');
CREATE TYPE "ProjectCriterionType" AS ENUM ('AUTO', 'MANUAL');
CREATE TYPE "ProjectAutoCheckType" AS ENUM ('FILE_EXISTS', 'JSON_FIELD', 'BUILD_SUCCESS', 'TEST_SUCCESS', 'DEPLOYMENT_HEALTH');
CREATE TYPE "ProjectSubmissionStatus" AS ENUM ('QUEUED', 'CLONING', 'GRADING', 'AWAITING_REVIEW', 'PASSED', 'FAILED', 'ERROR', 'TIMED_OUT');
CREATE TYPE "ProjectRubricResultStatus" AS ENUM ('PASSED', 'FAILED', 'PENDING_MANUAL', 'ERROR');

CREATE TABLE "project_checkpoint_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "checkpointId" UUID NOT NULL,
  "repositoryProvider" "RepositoryProvider" NOT NULL DEFAULT 'GITHUB',
  "defaultBranch" TEXT,
  "requireDeploymentUrl" BOOLEAN NOT NULL DEFAULT false,
  "maxRepositoryBytes" BIGINT NOT NULL,
  "maxBuildTimeMs" INTEGER NOT NULL,
  "maxTestTimeMs" INTEGER NOT NULL,
  "passScore" DECIMAL(5,2) NOT NULL DEFAULT 70,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_checkpoint_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_rubric_criteria" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectCheckpointConfigId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" "ProjectCriterionType" NOT NULL,
  "autoCheckType" "ProjectAutoCheckType",
  "configJson" JSONB,
  "weight" DECIMAL(8,2) NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_rubric_criteria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "checkpointId" UUID NOT NULL,
  "projectCheckpointConfigId" UUID NOT NULL,
  "repositoryUrl" TEXT NOT NULL,
  "repositoryProvider" "RepositoryProvider" NOT NULL,
  "repositoryOwner" TEXT NOT NULL,
  "repositoryName" TEXT NOT NULL,
  "branch" TEXT,
  "commitSha" TEXT NOT NULL,
  "deploymentUrl" TEXT,
  "status" "ProjectSubmissionStatus" NOT NULL DEFAULT 'QUEUED',
  "jobId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "gradingConfigSnapshotJson" JSONB NOT NULL,
  "score" DECIMAL(5,2),
  "passed" BOOLEAN,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_grades" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "submissionId" UUID NOT NULL,
  "score" DECIMAL(5,2) NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "autoScore" DECIMAL(5,2) NOT NULL,
  "manualScore" DECIMAL(5,2),
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_grades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_rubric_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectGradeId" UUID NOT NULL,
  "criterionId" UUID,
  "displayTitle" TEXT NOT NULL,
  "status" "ProjectRubricResultStatus" NOT NULL,
  "scoreEarned" DECIMAL(8,2) NOT NULL,
  "maxScore" DECIMAL(8,2) NOT NULL,
  "feedback" TEXT,
  "detailsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_rubric_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_checkpoint_configs_checkpointId_key" ON "project_checkpoint_configs"("checkpointId");
CREATE UNIQUE INDEX "project_rubric_criteria_projectCheckpointConfigId_position_key" ON "project_rubric_criteria"("projectCheckpointConfigId", "position");
CREATE INDEX "project_rubric_criteria_projectCheckpointConfigId_type_idx" ON "project_rubric_criteria"("projectCheckpointConfigId", "type");
CREATE UNIQUE INDEX "project_submissions_jobId_key" ON "project_submissions"("jobId");
CREATE UNIQUE INDEX "project_submissions_idempotencyKey_key" ON "project_submissions"("idempotencyKey");
CREATE INDEX "project_submissions_userId_submittedAt_idx" ON "project_submissions"("userId", "submittedAt");
CREATE INDEX "project_submissions_checkpointId_submittedAt_idx" ON "project_submissions"("checkpointId", "submittedAt");
CREATE INDEX "project_submissions_status_idx" ON "project_submissions"("status");
CREATE INDEX "project_submissions_correlationId_idx" ON "project_submissions"("correlationId");
CREATE UNIQUE INDEX "project_grades_submissionId_key" ON "project_grades"("submissionId");
CREATE UNIQUE INDEX "project_rubric_results_projectGradeId_criterionId_key" ON "project_rubric_results"("projectGradeId", "criterionId");
CREATE INDEX "project_rubric_results_projectGradeId_idx" ON "project_rubric_results"("projectGradeId");
CREATE INDEX "project_rubric_results_criterionId_idx" ON "project_rubric_results"("criterionId");

ALTER TABLE "project_checkpoint_configs" ADD CONSTRAINT "project_checkpoint_configs_checkpointId_fkey"
  FOREIGN KEY ("checkpointId") REFERENCES "video_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_rubric_criteria" ADD CONSTRAINT "project_rubric_criteria_projectCheckpointConfigId_fkey"
  FOREIGN KEY ("projectCheckpointConfigId") REFERENCES "project_checkpoint_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_checkpointId_fkey"
  FOREIGN KEY ("checkpointId") REFERENCES "video_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_projectCheckpointConfigId_fkey"
  FOREIGN KEY ("projectCheckpointConfigId") REFERENCES "project_checkpoint_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_grades" ADD CONSTRAINT "project_grades_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "project_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_rubric_results" ADD CONSTRAINT "project_rubric_results_projectGradeId_fkey"
  FOREIGN KEY ("projectGradeId") REFERENCES "project_grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_rubric_results" ADD CONSTRAINT "project_rubric_results_criterionId_fkey"
  FOREIGN KEY ("criterionId") REFERENCES "project_rubric_criteria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
