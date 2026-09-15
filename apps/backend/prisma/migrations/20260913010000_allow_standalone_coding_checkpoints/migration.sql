-- AlterTable
ALTER TABLE "video_checkpoints" ALTER COLUMN "videoAssetId" DROP NOT NULL;
ALTER TABLE "video_checkpoints" ALTER COLUMN "timestampSeconds" SET DEFAULT 0;
