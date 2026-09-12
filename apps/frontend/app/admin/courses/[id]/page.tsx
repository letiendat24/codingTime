'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { requestJson } from '../../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../../admin-components';

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

  if (detail.isError) return <AdminError />;
  const course = detail.data?.course;

  return (
    <section className="space-y-6">
      <div className="rounded-md border p-4">
        <h2 className="text-xl font-semibold">{course?.title}</h2>
        <p className="text-sm text-muted-foreground">{course?.shortDescription}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {course ? <StatusBadge value={course.status} /> : null}
          {course ? <StatusBadge value={course.difficulty} /> : null}
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Instructor</dt><dd>{course?.instructor.email}</dd></div>
          <div><dt className="text-muted-foreground">Modules</dt><dd>{course?.moduleCount ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Lessons</dt><dd>{course?.lessonCount ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Enrollments</dt><dd>{course?.enrollmentCount ?? 0}</dd></div>
        </dl>
        {course?.status !== 'ARCHIVED' ? (
          <button className="mt-4 rounded-md border px-3 py-2 text-sm" onClick={() => archive.mutate()}>
            Archive Course
          </button>
        ) : null}
      </div>

      <div className="rounded-md border p-4">
        <h3 className="font-semibold">Structure</h3>
        <div className="mt-3 space-y-3">
          {(course?.modules ?? []).map((module) => (
            <div key={module.id} className="rounded-md border p-3">
              <p className="font-medium">{module.title}</p>
              <div className="mt-2 space-y-1 text-sm">
                {module.lessons.map((lesson) => (
                  <p key={lesson.id}>{lesson.title} · {lesson.lessonType} · video {lesson.videoStatus ?? '-'}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border p-4">
        <h3 className="font-semibold">Recent Enrollments</h3>
        <div className="mt-3 space-y-2 text-sm">
          {(course?.recentEnrollments ?? []).map((enrollment) => (
            <p key={enrollment.id}>
              {enrollment.student.email} · {enrollment.status} · {enrollment.progressPercent ?? 0}% · published {formatDate(course?.publishedAt ?? null)}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
