'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { type AdminCourseSummary, type AdminUserDetail, requestJson } from '../../../../lib/api';
import { AdminError, StatusBadge } from '../../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../../design-system/components/card';
import { Badge } from '../../../../design-system/components/badge';
import { LoadingState } from '../../../../design-system/components/loading-state';

interface InstructorDetailResponse {
  readonly instructor: AdminUserDetail;
  readonly courses: readonly AdminCourseSummary[];
}

export default function AdminInstructorDetailPage() {
  const params = useParams<{ id: string }>();
  const detail = useQuery({
    queryKey: ['admin-instructor', params.id],
    queryFn: () => requestJson<InstructorDetailResponse>(`/admin/instructors/${params.id}`),
    retry: false,
  });

  if (detail.isError) return <AdminError message={detail.error instanceof Error ? detail.error.message : undefined} />;
  if (detail.isLoading) {
    return (
      <div className="py-16">
        <LoadingState message="Loading instructor portfolio..." />
      </div>
    );
  }

  const instructor = detail.data?.instructor;
  const courses = detail.data?.courses ?? [];

  return (
    <div className="space-y-6">
      <Link
        href="/admin/instructors"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Instructors
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
              {instructor?.displayName?.charAt(0) ?? 'I'}
            </div>
            <div>
              <CardTitle className="text-lg">{instructor?.displayName}</CardTitle>
              <CardDescription>{instructor?.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Roles:</span>
            {instructor?.roles.map((role) => (
              <Badge key={role} variant="outline" className="text-xs">
                {role}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            {instructor ? <StatusBadge value={instructor.status} /> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Authored Courses</CardTitle>
              <CardDescription>All courses created and managed by this instructor</CardDescription>
            </div>
            <Badge variant="outline">{courses.length} Courses</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3.5">Course Title</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Lessons</th>
                  <th className="px-6 py-3.5 text-right">Student Enrollments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.map((course) => (
                  <tr key={course.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium">
                      <Link className="text-foreground hover:text-primary transition-colors" href={`/admin/courses/${course.id}`}>
                        {course.title}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge value={course.status} />
                    </td>
                    <td className="px-6 py-4 font-semibold">{course.lessonCount}</td>
                    <td className="px-6 py-4 text-right font-semibold">{course.enrollmentCount}</td>
                  </tr>
                ))}
                {courses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      No courses created by this instructor yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
