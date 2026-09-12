'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type CourseDetail, requestJson } from '../../../lib/api';

interface InstructorCoursesResponse {
  readonly items: readonly CourseDetail[];
}

export default function InstructorCoursesPage() {
  const courses = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => requestJson<InstructorCoursesResponse>('/instructor/courses'),
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Instructor Courses</h1>
        <Link className="rounded-md bg-primary px-4 py-2 text-primary-foreground" href="/instructor/courses/new">
          New
        </Link>
      </div>

      <div className="space-y-3">
        {courses.data?.items.map((course) => (
          <Link key={course.id} className="block rounded-md border p-4" href={`/instructor/courses/${course.id}`}>
            <h2 className="font-semibold">{course.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.status} · {course.modules.length} modules
            </p>
          </Link>
        ))}
      </div>
      {courses.isLoading ? <p className="text-sm text-muted-foreground">Loading courses...</p> : null}
      {courses.isError ? <p className="text-sm text-red-600">Login as instructor first.</p> : null}
    </main>
  );
}
