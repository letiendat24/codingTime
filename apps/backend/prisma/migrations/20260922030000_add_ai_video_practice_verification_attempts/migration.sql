ALTER TYPE "VideoPracticeVerificationMode" ADD VALUE IF NOT EXISTS 'AI_SEMANTIC';

CREATE TABLE IF NOT EXISTS "video_practice_verification_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "studentId" uuid NOT NULL,
  "lessonId" uuid NOT NULL,
  "checkpointId" uuid NOT NULL,
  "workspaceId" uuid,
  "currentSnapshotId" uuid,
  "previousSnapshotId" uuid,
  "evaluatorType" text NOT NULL,
  "evaluatorModel" text,
  "evaluatorVersion" text NOT NULL,
  "inputFingerprint" text NOT NULL,
  "instructorFingerprint" text NOT NULL,
  "status" text NOT NULL,
  "feedback" text NOT NULL,
  "guidance" text,
  "requirementsJson" jsonb,
  "cachedFromAttemptId" uuid,
  "providerErrorCode" text,
  "startedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "video_practice_verification_attempts_studentId_checkpointId_inputFingerprint_idx"
  ON "video_practice_verification_attempts" ("studentId", "checkpointId", "inputFingerprint");

CREATE INDEX IF NOT EXISTS "video_practice_verification_attempts_lessonId_checkpointId_createdAt_idx"
  ON "video_practice_verification_attempts" ("lessonId", "checkpointId", "createdAt");

CREATE INDEX IF NOT EXISTS "video_practice_verification_attempts_workspaceId_idx"
  ON "video_practice_verification_attempts" ("workspaceId");
