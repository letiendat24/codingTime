CREATE TYPE "NotificationType" AS ENUM (
  'JUDGE_COMPLETED',
  'PRACTICE_SOLVED',
  'PROJECT_SUBMITTED',
  'PROJECT_GRADED',
  'PROJECT_MANUAL_REVIEW_REQUIRED',
  'VIDEO_PROCESSING_COMPLETED',
  'VIDEO_PROCESSING_FAILED',
  'COURSE_PUBLISHED',
  'COURSE_UPDATED',
  'ADMIN_OPERATION_ALERT'
);

CREATE TYPE "NotificationCategory" AS ENUM (
  'LEARNING',
  'PRACTICE',
  'PROJECT',
  'COURSE',
  'SYSTEM'
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "dataJson" JSONB,
  "actionUrl" TEXT,
  "dedupeKey" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "learningEnabled" BOOLEAN NOT NULL DEFAULT true,
  "practiceEnabled" BOOLEAN NOT NULL DEFAULT true,
  "projectEnabled" BOOLEAN NOT NULL DEFAULT true,
  "courseEnabled" BOOLEAN NOT NULL DEFAULT true,
  "systemEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");
CREATE INDEX "notifications_userId_category_createdAt_idx" ON "notifications"("userId", "category", "createdAt");
CREATE INDEX "notifications_category_idx" ON "notifications"("category");
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
