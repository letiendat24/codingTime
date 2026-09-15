-- CreateEnum
CREATE TYPE "VideoPracticeVerificationMode" AS ENUM ('NONE', 'CODE_COMPARE', 'TESTS');

-- CreateEnum
CREATE TYPE "VideoPracticeBehavior" AS ENUM ('GUIDED', 'REQUIRED');

-- AlterEnum
ALTER TYPE "CheckpointProgressStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

-- AlterTable
ALTER TABLE "video_checkpoints"
ADD COLUMN "practiceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "practiceVerificationMode" "VideoPracticeVerificationMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN "practiceBehavior" "VideoPracticeBehavior" NOT NULL DEFAULT 'GUIDED',
ADD COLUMN "practiceSnapshotId" UUID,
ADD COLUMN "practiceTargetFilePath" TEXT,
ADD COLUMN "practiceTargetStartLine" INTEGER,
ADD COLUMN "practiceTargetEndLine" INTEGER;

-- CreateIndex
CREATE INDEX "video_checkpoints_videoAssetId_practiceEnabled_timestampSeconds_idx"
ON "video_checkpoints"("videoAssetId", "practiceEnabled", "timestampSeconds");
