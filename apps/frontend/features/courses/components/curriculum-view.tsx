'use client';

import { CheckCircle2, Circle, Code, FileText, HelpCircle, Layout, Video } from 'lucide-react';
import Link from 'next/link';
import type { CourseDetail } from '../../../lib/api';

export interface CurriculumViewProps {
  readonly course: CourseDetail;
  readonly completedLessonIds?: ReadonlySet<string>;
  readonly currentLessonId?: string;
  readonly isEnrolled?: boolean;
}

export function getLessonIcon(type: string) {
  switch (type) {
    case 'VIDEO':
      return <Video className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
    case 'CODING':
      return <Code className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    case 'PROJECT':
      return <Layout className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
    case 'QUIZ':
      return <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

export function CurriculumView({
  course,
  completedLessonIds = new Set(),
  currentLessonId,
  isEnrolled,
}: CurriculumViewProps) {
  return (
    <div className="space-y-4">
      {course.modules.map((module, moduleIndex) => (
        <div
          key={module.id}
          className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
        >
          {/* Module Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/60">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Module {moduleIndex + 1}: {module.title}
            </h3>
            <span className="text-[11px] text-muted-foreground font-medium">
              {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
          </div>

          {/* Module Lessons List */}
          <div className="divide-y divide-border/50">
            {module.lessons.map((lesson) => {
              const isCompleted = completedLessonIds.has(lesson.id);
              const isCurrent = lesson.id === currentLessonId;

              const content = (
                <div
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 transition-colors ${
                    isCurrent ? 'bg-muted/60 font-medium' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    )}
                    <div className="flex items-center gap-2 truncate">
                      {getLessonIcon(lesson.lessonType)}
                      <span className={`text-xs truncate ${isCurrent ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
                        {lesson.title}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {lesson.lessonType}
                    </span>
                  </div>
                </div>
              );

              if (isEnrolled) {
                return (
                  <Link key={lesson.id} href={`/courses/${course.slug}/learn?lesson=${lesson.id}`} className="block">
                    {content}
                  </Link>
                );
              }

              return <div key={lesson.id}>{content}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

