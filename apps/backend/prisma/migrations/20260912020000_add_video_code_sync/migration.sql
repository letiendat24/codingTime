-- CreateTable
CREATE TABLE "video_code_along_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lessonId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL,
    "entryFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_code_along_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "filesJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_code_along_configs_lessonId_key" ON "video_code_along_configs"("lessonId");

-- CreateIndex
CREATE INDEX "workspace_revisions_workspaceId_createdAt_idx" ON "workspace_revisions"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_userId_lessonId_lesson_context_key"
ON "workspaces"("userId", "lessonId")
WHERE "lessonId" IS NOT NULL AND "checkpointId" IS NULL AND "practiceProblemId" IS NULL;

-- AddForeignKey
ALTER TABLE "video_code_along_configs"
ADD CONSTRAINT "video_code_along_configs_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_revisions"
ADD CONSTRAINT "workspace_revisions_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
