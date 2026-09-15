-- CreateEnum
CREATE TYPE "TranscriptSource" AS ENUM ('MANUAL', 'FILE_UPLOAD', 'AUTO_GENERATED');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('DRAFT', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "video_transcripts" (
    "id" UUID NOT NULL,
    "videoAssetId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "source" "TranscriptSource" NOT NULL,
    "status" "TranscriptStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_transcript_segments" (
    "id" UUID NOT NULL,
    "transcriptId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "startTimeMs" INTEGER NOT NULL,
    "endTimeMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_transcripts_videoAssetId_language_key" ON "video_transcripts"("videoAssetId", "language");

-- CreateIndex
CREATE INDEX "video_transcripts_videoAssetId_status_idx" ON "video_transcripts"("videoAssetId", "status");

-- CreateIndex
CREATE INDEX "video_transcripts_language_idx" ON "video_transcripts"("language");

-- CreateIndex
CREATE UNIQUE INDEX "video_transcript_segments_transcriptId_order_key" ON "video_transcript_segments"("transcriptId", "order");

-- CreateIndex
CREATE INDEX "video_transcript_segments_transcriptId_startTimeMs_idx" ON "video_transcript_segments"("transcriptId", "startTimeMs");

-- AddForeignKey
ALTER TABLE "video_transcripts" ADD CONSTRAINT "video_transcripts_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_transcript_segments" ADD CONSTRAINT "video_transcript_segments_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "video_transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
