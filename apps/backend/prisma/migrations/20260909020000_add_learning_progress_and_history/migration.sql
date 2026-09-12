CREATE TYPE "LessonProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

CREATE TYPE "LearningActivityType" AS ENUM ('COURSE_ENROLLED', 'LESSON_STARTED', 'LESSON_COMPLETED', 'COURSE_COMPLETED');

CREATE TABLE "course_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "enrollmentId" UUID NOT NULL,
  "totalLessons" INTEGER NOT NULL DEFAULT 0,
  "completedLessons" INTEGER NOT NULL DEFAULT 0,
  "progressPercent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAccessedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "course_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lesson_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studentId" UUID NOT NULL,
  "lessonId" UUID NOT NULL,
  "enrollmentId" UUID NOT NULL,
  "status" "LessonProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" TIMESTAMP(3),
  "lastAccessedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "type" "LearningActivityType" NOT NULL,
  "courseId" UUID,
  "lessonId" UUID,
  "enrollmentId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_progress_enrollmentId_key" ON "course_progress"("enrollmentId");
CREATE UNIQUE INDEX "lesson_progress_studentId_lessonId_key" ON "lesson_progress"("studentId", "lessonId");
CREATE INDEX "lesson_progress_enrollmentId_idx" ON "lesson_progress"("enrollmentId");
CREATE INDEX "lesson_progress_lessonId_idx" ON "lesson_progress"("lessonId");
CREATE INDEX "learning_activities_userId_type_enrollmentId_idx" ON "learning_activities"("userId", "type", "enrollmentId");
CREATE INDEX "learning_activities_userId_createdAt_idx" ON "learning_activities"("userId", "createdAt");
CREATE INDEX "learning_activities_courseId_idx" ON "learning_activities"("courseId");
CREATE INDEX "learning_activities_lessonId_idx" ON "learning_activities"("lessonId");
CREATE UNIQUE INDEX "learning_activities_course_enrollment_unique" ON "learning_activities"("userId", "type", "enrollmentId") WHERE "lessonId" IS NULL;
CREATE UNIQUE INDEX "learning_activities_lesson_unique" ON "learning_activities"("userId", "type", "lessonId") WHERE "lessonId" IS NOT NULL;

ALTER TABLE "course_progress"
  ADD CONSTRAINT "course_progress_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lesson_progress"
  ADD CONSTRAINT "lesson_progress_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lesson_progress"
  ADD CONSTRAINT "lesson_progress_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lesson_progress"
  ADD CONSTRAINT "lesson_progress_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_activities"
  ADD CONSTRAINT "learning_activities_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_activities"
  ADD CONSTRAINT "learning_activities_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_activities"
  ADD CONSTRAINT "learning_activities_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_activities"
  ADD CONSTRAINT "learning_activities_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
