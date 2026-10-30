ALTER TABLE "notifications"
  ADD COLUMN "seenAt" TIMESTAMP(3);

UPDATE "notifications"
SET "seenAt" = "readAt"
WHERE "readAt" IS NOT NULL;

CREATE INDEX "notifications_userId_seenAt_idx" ON "notifications"("userId", "seenAt");
