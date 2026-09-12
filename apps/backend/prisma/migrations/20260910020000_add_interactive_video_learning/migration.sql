ALTER TYPE "LearningActivityType" ADD VALUE IF NOT EXISTS 'VIDEO_STARTED';
ALTER TYPE "LearningActivityType" ADD VALUE IF NOT EXISTS 'VIDEO_COMPLETED';
ALTER TYPE "LearningActivityType" ADD VALUE IF NOT EXISTS 'CHECKPOINT_COMPLETED';

CREATE TYPE "VideoCheckpointType" AS ENUM ('INFO', 'QUIZ', 'CODING', 'PROJECT');

CREATE TYPE "CheckpointProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "video_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studentId" UUID NOT NULL,
  "videoAssetId" UUID NOT NULL,
  "lessonId" UUID NOT NULL,
  "lastPositionSeconds" INTEGER NOT NULL DEFAULT 0,
  "furthestPositionSeconds" INTEGER NOT NULL DEFAULT 0,
  "watchedPercent" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastWatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "video_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_checkpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lessonId" UUID NOT NULL,
  "videoAssetId" UUID NOT NULL,
  "timestampSeconds" INTEGER NOT NULL,
  "type" "VideoCheckpointType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "pauseVideo" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "video_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkpoint_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studentId" UUID NOT NULL,
  "checkpointId" UUID NOT NULL,
  "status" "CheckpointProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "checkpoint_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "code_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lessonId" UUID NOT NULL,
  "videoAssetId" UUID NOT NULL,
  "timestampSeconds" INTEGER NOT NULL,
  "title" TEXT,
  "language" TEXT NOT NULL,
  "filesJson" JSONB NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "code_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_progress_studentId_videoAssetId_key" ON "video_progress"("studentId", "videoAssetId");
CREATE INDEX "video_progress_studentId_lessonId_idx" ON "video_progress"("studentId", "lessonId");
CREATE INDEX "video_progress_videoAssetId_idx" ON "video_progress"("videoAssetId");
CREATE INDEX "video_checkpoints_videoAssetId_timestampSeconds_position_idx" ON "video_checkpoints"("videoAssetId", "timestampSeconds", "position");
CREATE INDEX "video_checkpoints_lessonId_idx" ON "video_checkpoints"("lessonId");
CREATE UNIQUE INDEX "checkpoint_progress_studentId_checkpointId_key" ON "checkpoint_progress"("studentId", "checkpointId");
CREATE INDEX "checkpoint_progress_checkpointId_idx" ON "checkpoint_progress"("checkpointId");
CREATE INDEX "code_snapshots_videoAssetId_timestampSeconds_idx" ON "code_snapshots"("videoAssetId", "timestampSeconds");
CREATE INDEX "code_snapshots_lessonId_idx" ON "code_snapshots"("lessonId");
CREATE INDEX "code_snapshots_createdByUserId_idx" ON "code_snapshots"("createdByUserId");

ALTER TABLE "video_progress"
  ADD CONSTRAINT "video_progress_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_progress"
  ADD CONSTRAINT "video_progress_videoAssetId_fkey"
  FOREIGN KEY ("videoAssetId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_progress"
  ADD CONSTRAINT "video_progress_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_checkpoints"
  ADD CONSTRAINT "video_checkpoints_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_checkpoints"
  ADD CONSTRAINT "video_checkpoints_videoAssetId_fkey"
  FOREIGN KEY ("videoAssetId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkpoint_progress"
  ADD CONSTRAINT "checkpoint_progress_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkpoint_progress"
  ADD CONSTRAINT "checkpoint_progress_checkpointId_fkey"
  FOREIGN KEY ("checkpointId") REFERENCES "video_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "code_snapshots"
  ADD CONSTRAINT "code_snapshots_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "code_snapshots"
  ADD CONSTRAINT "code_snapshots_videoAssetId_fkey"
  FOREIGN KEY ("videoAssetId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "code_snapshots"
  ADD CONSTRAINT "code_snapshots_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
