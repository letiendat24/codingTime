'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { type CourseDetail, requestJson } from '../../../lib/api';

interface CourseDetailResponse {
  readonly course: CourseDetail;
}

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const course = useQuery({
    queryKey: ['course', params.slug],
    queryFn: () => requestJson<CourseDetailResponse>(`/courses/${params.slug}`),
  });
  const enroll = useMutation({
    mutationFn: () => requestJson('/courses/' + course.data?.course.id + '/enroll', { method: 'POST' }),
  });

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      {course.data ? (
        <>
          <header className="mb-8">
            <p className="text-sm text-muted-foreground">{course.data.course.category.name}</p>
            <h1 className="mt-2 text-3xl font-semibold">{course.data.course.title}</h1>
            <p className="mt-3 text-muted-foreground">{course.data.course.description}</p>
            <button
              className="mt-5 rounded-md bg-primary px-4 py-2 text-primary-foreground"
              type="button"
              onClick={() => enroll.mutate()}
            >
              Enroll
            </button>
            <a
              className="ml-3 inline-flex rounded-md border px-4 py-2 text-sm"
              href={`/courses/${course.data.course.slug}/learn`}
            >
              Learn
            </a>
          </header>

          <div className="space-y-5">
            {course.data.course.modules.map((module) => (
              <section key={module.id} className="rounded-md border p-4">
                <h2 className="font-semibold">{module.title}</h2>
                <ul className="mt-3 space-y-2">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id} className="text-sm text-muted-foreground">
                      {lesson.position}. {lesson.title} ({lesson.lessonType})
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : null}

      {course.isLoading ? <p className="text-sm text-muted-foreground">Loading course...</p> : null}
      {course.isError ? <p className="text-sm text-red-600">Course not found.</p> : null}
      {enroll.isSuccess ? <p className="mt-4 text-sm text-muted-foreground">Enrollment created.</p> : null}
      {enroll.isError ? <p className="mt-4 text-sm text-red-600">{enroll.error.message}</p> : null}
    </main>
  );
}
