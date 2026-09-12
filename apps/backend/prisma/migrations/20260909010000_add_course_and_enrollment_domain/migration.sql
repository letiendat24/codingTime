CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CourseDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'ARTICLE', 'CODING', 'PROJECT', 'QUIZ');
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "course_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "course_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "course_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "courses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "shortDescription" TEXT,
  "description" TEXT,
  "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
  "difficulty" "CourseDifficulty" NOT NULL,
  "thumbnailObjectKey" TEXT,
  "ownerInstructorId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),

  CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_tag_assignments" (
  "courseId" UUID NOT NULL,
  "tagId" UUID NOT NULL,

  CONSTRAINT "course_tag_assignments_pkey" PRIMARY KEY ("courseId", "tagId")
);

CREATE TABLE "course_modules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "courseId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lessons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "moduleId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "position" INTEGER NOT NULL,
  "lessonType" "LessonType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studentId" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_categories_slug_key" ON "course_categories"("slug");
CREATE UNIQUE INDEX "course_tags_slug_key" ON "course_tags"("slug");
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");
CREATE INDEX "courses_ownerInstructorId_idx" ON "courses"("ownerInstructorId");
CREATE INDEX "courses_status_idx" ON "courses"("status");
CREATE INDEX "courses_categoryId_idx" ON "courses"("categoryId");
CREATE UNIQUE INDEX "course_modules_courseId_position_key" ON "course_modules"("courseId", "position");
CREATE INDEX "course_modules_courseId_idx" ON "course_modules"("courseId");
CREATE UNIQUE INDEX "lessons_moduleId_position_key" ON "lessons"("moduleId", "position");
CREATE INDEX "lessons_moduleId_idx" ON "lessons"("moduleId");
CREATE UNIQUE INDEX "enrollments_studentId_courseId_key" ON "enrollments"("studentId", "courseId");
CREATE INDEX "enrollments_courseId_idx" ON "enrollments"("courseId");

ALTER TABLE "courses"
  ADD CONSTRAINT "courses_ownerInstructorId_fkey"
  FOREIGN KEY ("ownerInstructorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "courses"
  ADD CONSTRAINT "courses_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "course_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "course_tag_assignments"
  ADD CONSTRAINT "course_tag_assignments_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_tag_assignments"
  ADD CONSTRAINT "course_tag_assignments_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "course_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_modules"
  ADD CONSTRAINT "course_modules_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollments"
  ADD CONSTRAINT "enrollments_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollments"
  ADD CONSTRAINT "enrollments_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
