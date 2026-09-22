-- AlterTable
ALTER TABLE "video_code_along_configs"
ADD COLUMN "defaultPracticeBehavior" "VideoPracticeBehavior" NOT NULL DEFAULT 'REQUIRED',
ADD COLUMN "defaultVerificationStrategy" TEXT NOT NULL DEFAULT 'AUTO';
