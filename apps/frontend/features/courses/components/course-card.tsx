'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CourseArtwork } from './course-artwork';
import type { CourseSummary } from '../../../lib/api';
import { useI18n } from '../../../providers/i18n-provider';

export interface CourseCardProps {
  readonly course: CourseSummary;
  readonly isEnrolled?: boolean | undefined;
  readonly progressPercent?: number | undefined;
  readonly completedLessons?: number | undefined;
  readonly totalLessons?: number | undefined;
}

function ProgressRing({ percent }: { readonly percent: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold text-foreground">{percent}%</span>
      <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
        <circle
          className="text-muted-foreground/20"
          strokeWidth="2.5"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="8"
          cy="8"
        />
        <circle
          className="text-emerald-500 transition-all duration-500 ease-out"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="8"
          cy="8"
        />
      </svg>
    </div>
  );
}

function formatDifficulty(difficulty: string): string {
  switch (difficulty.toUpperCase()) {
    case 'BEGINNER':
      return 'Junior';
    case 'INTERMEDIATE':
      return 'Medium';
    case 'ADVANCED':
      return 'Advance';
    default:
      return difficulty;
  }
}

export function CourseCard({
  course,
  isEnrolled,
  progressPercent,
  totalLessons,
}: CourseCardProps) {
  const { t: _t } = useI18n();

  const isCompleted = isEnrolled && progressPercent === 100;
  const targetLink = isEnrolled ? `/courses/${course.slug}/learn` : `/courses/${course.slug}`;

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex flex-col h-full"
    >
      <Link
        href={targetLink}
        className="group flex flex-1 flex-col justify-between overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.06)] hover:border-border transition-shadow"
      >
      {/* Editorial Course Artwork */}
      <CourseArtwork
        title={course.title}
        categoryName={course.category.name}
        tags={course.tags}
        slug={course.slug}
        lessonCount={totalLessons ?? (course as unknown as { lessonCount?: number }).lessonCount}
      />

      {/* Card Content Body */}
      <div className="flex flex-1 flex-col justify-between p-4 sm:p-4.5">
        <div>
          {/* Subtle Tag Pills */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            <span className="inline-flex items-center rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {course.category.name}
            </span>
            {course.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground/80"
              >
                {tag.name}
              </span>
            ))}
          </div>

          {/* Crisp Course Title */}
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
            {course.title}
          </h3>

          {course.shortDescription ? (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {course.shortDescription}
            </p>
          ) : null}
        </div>

        {/* Footer Level & Progress */}
        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>Level:</span>
            <span className="font-medium text-foreground">{formatDifficulty(course.difficulty)}</span>
          </div>

          <div>
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <span>Completed</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
            ) : isEnrolled && progressPercent !== undefined && progressPercent > 0 ? (
              <div className="flex items-center gap-1.5">
                <span>Progress:</span>
                <ProgressRing percent={progressPercent} />
              </div>
            ) : (
              <span className="text-muted-foreground/80 text-[11px]">Not Started</span>
            )}
          </div>
        </div>
      </div>
    </Link>
    </motion.div>
  );
}

