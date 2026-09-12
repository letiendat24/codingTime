'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type AdminInstructorSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
import { LoadingState } from '../../../design-system/components/loading-state';

export default function AdminInstructorsPage() {
  const instructors = useQuery({
    queryKey: ['admin-instructors'],
    queryFn: () => requestJson<PaginatedResponse<AdminInstructorSummary>>('/admin/instructors?page=1&limit=50'),
    retry: false,
  });

  if (instructors.isError) return <AdminError message={instructors.error instanceof Error ? instructors.error.message : undefined} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Course Instructors</CardTitle>
              <CardDescription>
                Overview of educators, course production, and student enrollment volume.
              </CardDescription>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              Total: {instructors.data?.pagination.total ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {instructors.isLoading ? (
            <div className="py-12">
              <LoadingState message="Loading instructor list..." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3.5">Instructor</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Total Courses</th>
                    <th className="px-6 py-3.5">Published</th>
                    <th className="px-6 py-3.5">Enrollments</th>
                    <th className="px-6 py-3.5 text-right">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(instructors.data?.items ?? []).map((instructor) => (
                    <tr key={instructor.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <Link
                          className="font-medium text-foreground hover:text-primary transition-colors"
                          href={`/admin/instructors/${instructor.id}`}
                        >
                          {instructor.displayName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{instructor.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge value={instructor.status} />
                      </td>
                      <td className="px-6 py-4 font-semibold">{instructor.courseCount}</td>
                      <td className="px-6 py-4 font-semibold text-emerald-600 dark:text-emerald-400">
                        {instructor.publishedCourseCount}
                      </td>
                      <td className="px-6 py-4 font-semibold">{instructor.enrollmentCount}</td>
                      <td className="px-6 py-4 text-right text-xs text-muted-foreground">
                        {formatDate(instructor.createdAt)}
                      </td>
                    </tr>
                  ))}
                  {(instructors.data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                        No instructor accounts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
