import type { CourseDifficulty, CourseStatus, LessonType } from '@prisma/client';

export interface PublicInstructor {
  readonly id: string;
  readonly displayName: string;
}

export interface PublicCategory {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface PublicTag {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface PublicLesson {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly lessonType: LessonType;
}

export interface PublicModule {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly lessons: readonly PublicLesson[];
}

export interface PublicCourseSummary {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly shortDescription: string | null;
  readonly difficulty: CourseDifficulty;
  readonly category: PublicCategory;
  readonly tags: readonly PublicTag[];
  readonly instructor: PublicInstructor;
}

export interface PublicCourseDetail extends PublicCourseSummary {
  readonly description: string | null;
  readonly modules: readonly PublicModule[];
}

export interface InstructorCourseDetail extends PublicCourseDetail {
  readonly status: CourseStatus;
  readonly thumbnailObjectKey: string | null;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
