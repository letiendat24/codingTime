'use client';

import { BookOpen, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, StatusBadge } from '../../../design-system';
import type { CourseSummary } from '../../../lib/api';
import { useI18n } from '../../../providers/i18n-provider';

export interface CourseCardProps {
  readonly course: CourseSummary;
  readonly isEnrolled?: boolean | undefined;
  readonly progressPercent?: number | undefined;
  readonly completedLessons?: number | undefined;
  readonly totalLessons?: number | undefined;
}

export function CourseCard({
  course,
  isEnrolled,
  progressPercent,
  completedLessons,
  totalLessons,
}: CourseCardProps) {
  const { t } = useI18n();

  const isCompleted = isEnrolled && progressPercent === 100;
  const ctaLink = isEnrolled ? `/courses/${course.slug}/learn` : `/courses/${course.slug}`;

  return (
    <Card className="flex flex-col justify-between overflow-hidden transition-all hover:border-primary/40 hover:shadow-md">
      <div className="h-36 bg-gradient-to-br from-slate-800 to-slate-950 p-4 text-white flex flex-col justify-between border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <Badge tone="info" className="bg-white/10 text-white border-white/20">
            {course.category.name}
          </Badge>
          <StatusBadge value={course.difficulty} />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <BookOpen className="h-3.5 w-3.5" />
          <span>{course.instructor.displayName}</span>
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div>
          <Link href={`/courses/${course.slug}`}>
            <h3 className="text-base font-semibold text-foreground hover:text-primary transition-colors line-clamp-1">
              {course.title}
            </h3>
          </Link>
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {course.shortDescription ?? ''}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {course.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                #{tag.name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          {isEnrolled && progressPercent !== undefined ? (
            <div className="mb-3 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {completedLessons !== undefined && totalLessons !== undefined
                    ? t('courses.lessons', { completed: completedLessons, total: totalLessons })
                    : `${progressPercent}%`}
                </span>
                <span className="font-semibold text-foreground">{progressPercent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Link href={ctaLink} className="w-full">
              <Button
                size="sm"
                variant={isEnrolled ? 'primary' : 'secondary'}
                className="w-full"
              >
                {isCompleted ? (
                  <>
                    <GraduationCap className="h-3.5 w-3.5 mr-1" />
                    <span>{t('courses.review')}</span>
                  </>
                ) : isEnrolled ? (
                  <span>{t('courses.continueLearning')}</span>
                ) : (
                  <span>{t('courses.viewCourse')}</span>
                )}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
