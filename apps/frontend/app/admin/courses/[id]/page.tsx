'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ArrowLeft, Archive, Layers, Users } from 'lucide-react';
import Link from 'next/link';
import { requestJson } from '../../../../lib/api';
import { AdminError, StatusBadge } from '../../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../../design-system/components/card';
import { Button } from '../../../../design-system/components/button';
import { Badge } from '../../../../design-system/components/badge';
import { LoadingState } from '../../../../design-system/components/loading-state';

interface AdminCourseDetailResponse {
  readonly course: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
    readonly status: string;
    readonly difficulty: string;
    readonly shortDescription: string | null;
    readonly instructor: { readonly displayName: string; readonly email: string };
    readonly moduleCount: number;
    readonly lessonCount: number;
    readonly enrollmentCount: number;
    readonly publishedAt: string | null;
    readonly archivedAt: string | null;
    readonly modules: readonly {
      readonly id: string;
      readonly title: string;
      readonly lessons: readonly { readonly id: string; readonly title: string; readonly lessonType: string; readonly videoStatus: string | null }[];
    }[];
    readonly recentEnrollments: readonly {
      readonly id: string;
      readonly student: { readonly displayName: string; readonly email: string };
      readonly status: string;
      readonly progressPercent: number | null;
    }[];
  };
}

export default function AdminCourseDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['admin-course', params.id],
    queryFn: () => requestJson<AdminCourseDetailResponse>(`/admin/courses/${params.id}`),
    retry: false,
  });
  const archive = useMutation({
    mutationFn: () =>
      requestJson(`/admin/courses/${params.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'admin course detail action' }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-course', params.id] }),
  });

  if (detail.isError) return <AdminError message={detail.error instanceof Error ? detail.error.message : undefined} />;
  if (detail.isLoading) {
    return (
      <div className="py-16">
        <LoadingState message="Loading course curriculum and analytics..." />
      </div>
    );
  }

  const course = detail.data?.course;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/courses"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Courses
      </Link>

      {/* Course Header Overview */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{course?.title}</CardTitle>
                {course ? <StatusBadge value={course.status} /> : null}
                {course ? <Badge variant="outline">{course.difficulty}</Badge> : null}
              </div>
              <CardDescription className="mt-1">{course?.shortDescription ?? 'No description provided.'}</CardDescription>
            </div>
            {course?.status !== 'ARCHIVED' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => archive.mutate()}
                isLoading={archive.isPending}
                leftIcon={<Archive className="h-4 w-4" />}
              >
                Archive Course
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-4 text-sm">
            <div className="rounded-lg border bg-muted/20 p-3">
              <dt className="text-xs text-muted-foreground">Instructor</dt>
              <dd className="mt-1 font-semibold text-foreground">{course?.instructor.email}</dd>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <dt className="text-xs text-muted-foreground">Curriculum Modules</dt>
              <dd className="mt-1 font-semibold text-foreground">{course?.moduleCount ?? 0}</dd>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <dt className="text-xs text-muted-foreground">Total Lessons</dt>
              <dd className="mt-1 font-semibold text-foreground">{course?.lessonCount ?? 0}</dd>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <dt className="text-xs text-muted-foreground">Total Enrollments</dt>
              <dd className="mt-1 font-semibold text-foreground">{course?.enrollmentCount ?? 0}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Course Modules & Lessons Structure */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <CardTitle>Curriculum Structure</CardTitle>
            </div>
            <CardDescription>Modules and lesson assets</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(course?.modules ?? []).map((module, idx) => (
              <div key={module.id} className="rounded-lg border bg-card p-4">
                <p className="font-semibold text-foreground text-sm">
                  {idx + 1}. {module.title}
                </p>
                <div className="mt-3 space-y-1.5 pl-4 border-l-2 border-primary/20">
                  {module.lessons.map((lesson) => (
                    <div key={lesson.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{lesson.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{lesson.lessonType}</Badge>
                        {lesson.videoStatus ? <StatusBadge value={lesson.videoStatus} /> : null}
                      </div>
                    </div>
                  ))}
                  {module.lessons.length === 0 && (
                    <p className="text-xs text-muted-foreground">No lessons in this module.</p>
                  )}
                </div>
              </div>
            ))}
            {(course?.modules ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No modules authored yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Enrollments */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Recent Enrollments</CardTitle>
            </div>
            <CardDescription>Student enrollments and progress status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(course?.recentEnrollments ?? []).map((enrollment) => (
                <div key={enrollment.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{enrollment.student.email}</p>
                    <p className="text-xs text-muted-foreground">Progress: {enrollment.progressPercent ?? 0}%</p>
                  </div>
                  <StatusBadge value={enrollment.status} />
                </div>
              ))}
              {(course?.recentEnrollments ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No enrollments yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
