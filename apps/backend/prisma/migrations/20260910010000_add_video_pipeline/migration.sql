CREATE TYPE "VideoAssetStatus" AS ENUM ('CREATED', 'UPLOADING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

CREATE TYPE "VideoProcessingJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "stored_objects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bucket" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "etag" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stored_objects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lessonId" UUID NOT NULL,
  "status" "VideoAssetStatus" NOT NULL DEFAULT 'CREATED',
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "durationSeconds" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "sourceObjectKey" TEXT NOT NULL,
  "sourceObjectId" UUID,
  "masterPlaylistObjectKey" TEXT,
  "thumbnailObjectKey" TEXT,
  "processingProgress" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "readyAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),

  CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_processing_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "videoAssetId" UUID NOT NULL,
  "jobId" TEXT NOT NULL,
  "status" "VideoProcessingJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "video_processing_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_renditions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "videoAssetId" UUID NOT NULL,
  "quality" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "bitrate" INTEGER NOT NULL,
  "playlistObjectKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "video_renditions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_processing_failures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "videoAssetId" UUID NOT NULL,
  "jobId" TEXT NOT NULL,
  "errorCode" TEXT NOT NULL,
  "errorMessage" TEXT NOT NULL,
  "retryable" BOOLEAN NOT NULL,
  "attemptCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "video_processing_failures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stored_objects_bucket_objectKey_key" ON "stored_objects"("bucket", "objectKey");
CREATE INDEX "stored_objects_objectKey_idx" ON "stored_objects"("objectKey");
CREATE UNIQUE INDEX "video_assets_lessonId_key" ON "video_assets"("lessonId");
CREATE INDEX "video_assets_status_idx" ON "video_assets"("status");
CREATE INDEX "video_assets_createdByUserId_idx" ON "video_assets"("createdByUserId");
CREATE UNIQUE INDEX "video_processing_jobs_jobId_key" ON "video_processing_jobs"("jobId");
CREATE INDEX "video_processing_jobs_videoAssetId_idx" ON "video_processing_jobs"("videoAssetId");
CREATE INDEX "video_processing_jobs_status_idx" ON "video_processing_jobs"("status");
CREATE UNIQUE INDEX "video_renditions_videoAssetId_quality_key" ON "video_renditions"("videoAssetId", "quality");
CREATE INDEX "video_renditions_videoAssetId_idx" ON "video_renditions"("videoAssetId");
CREATE INDEX "video_processing_failures_videoAssetId_idx" ON "video_processing_failures"("videoAssetId");
CREATE INDEX "video_processing_failures_jobId_idx" ON "video_processing_failures"("jobId");
CREATE UNIQUE INDEX "video_processing_failures_jobId_errorCode_key" ON "video_processing_failures"("jobId", "errorCode");

ALTER TABLE "video_assets"
  ADD CONSTRAINT "video_assets_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_assets"
  ADD CONSTRAINT "video_assets_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_assets"
  ADD CONSTRAINT "video_assets_sourceObjectId_fkey"
  FOREIGN KEY ("sourceObjectId") REFERENCES "stored_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "video_processing_jobs"
  ADD CONSTRAINT "video_processing_jobs_videoAssetId_fkey"
  FOREIGN KEY ("videoAssetId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_renditions"
  ADD CONSTRAINT "video_renditions_videoAssetId_fkey"
  FOREIGN KEY ("videoAssetId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_processing_failures"
  ADD CONSTRAINT "video_processing_failures_videoAssetId_fkey"
  FOREIGN KEY ("videoAssetId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
