ALTER TYPE "VideoPracticeVerificationMode" ADD VALUE IF NOT EXISTS 'FILE_COMPARE';
ALTER TYPE "VideoPracticeVerificationMode" ADD VALUE IF NOT EXISTS 'STRUCTURAL';
ALTER TYPE "VideoPracticeVerificationMode" ADD VALUE IF NOT EXISTS 'WORKSPACE_STRUCTURE';

CREATE TYPE "VideoWorkspaceType" AS ENUM ('SINGLE_FILE', 'MULTI_FILE');

ALTER TABLE "video_code_along_configs"
ADD COLUMN "workspaceType" "VideoWorkspaceType" NOT NULL DEFAULT 'SINGLE_FILE',
ADD COLUMN "allowEditFiles" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allowCreateFiles" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowCreateFolders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowRenameFiles" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowDeleteFiles" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowRun" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allowCheck" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allowJudge" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "video_checkpoints"
ADD COLUMN "practiceVerificationRulesJson" JSONB;
