'use client';

import { CheckCircle2, Circle, Code, FileText, HelpCircle, Layout, Video } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../../../design-system';
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
      return <Video className="h-4 w-4 text-blue-500" />;
    case 'CODING':
      return <Code className="h-4 w-4 text-emerald-500" />;
    case 'PROJECT':
      return <Layout className="h-4 w-4 text-purple-500" />;
    case 'QUIZ':
      return <HelpCircle className="h-4 w-4 text-amber-500" />;
    default:
      return <FileText className="h-4 w-4 text-slate-500" />;
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
        <Card key={module.id} className="overflow-hidden">
          <CardHeader className="bg-muted/40 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Module {moduleIndex + 1}: {module.title}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border">
            {module.lessons.map((lesson) => {
              const isCompleted = completedLessonIds.has(lesson.id);
              const isCurrent = lesson.id === currentLessonId;

              const content = (
                <div className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <div className="flex items-center gap-3">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    )}
                    <div className="flex items-center gap-2">
                      {getLessonIcon(lesson.lessonType)}
                      <span className={`text-sm ${isCurrent ? 'font-semibold text-primary' : 'text-foreground'}`}>
                        {lesson.title}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral" className="text-[10px]">
                      {lesson.lessonType}
                    </Badge>
                  </div>
                </div>
              );

              if (isEnrolled) {
                return (
                  <Link key={lesson.id} href={`/courses/${course.slug}/learn?lesson=${lesson.id}`}>
                    {content}
                  </Link>
                );
              }

              return <div key={lesson.id}>{content}</div>;
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
