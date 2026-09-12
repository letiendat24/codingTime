'use client';

import { useQuery } from '@tanstack/react-query';
import { type AdminEnrollmentSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
import { LoadingState } from '../../../design-system/components/loading-state';

export default function AdminEnrollmentsPage() {
  const enrollments = useQuery({
    queryKey: ['admin-enrollments'],
    queryFn: () => requestJson<PaginatedResponse<AdminEnrollmentSummary>>('/admin/enrollments?page=1&limit=50'),
    retry: false,
  });

  if (enrollments.isError) return <AdminError message={enrollments.error instanceof Error ? enrollments.error.message : undefined} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Student Enrollments</CardTitle>
              <CardDescription>Live course registrations, completion states, and progress telemetry.</CardDescription>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              Total: {enrollments.data?.pagination.total ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {enrollments.isLoading ? (
            <div className="py-12">
              <LoadingState message="Loading enrollment records..." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3.5">Student</th>
                    <th className="px-6 py-3.5">Course</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Progress</th>
                    <th className="px-6 py-3.5">Enrolled Date</th>
                    <th className="px-6 py-3.5 text-right">Completed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(enrollments.data?.items ?? []).map((enrollment) => (
                    <tr key={enrollment.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4 font-medium text-foreground">{enrollment.student.email}</td>
                      <td className="px-6 py-4 text-foreground">{enrollment.course.title}</td>
                      <td className="px-6 py-4">
                        <StatusBadge value={enrollment.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${enrollment.progressPercent ?? 0}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">
                            {enrollment.progressPercent ?? 0}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">{formatDate(enrollment.enrolledAt)}</td>
                      <td className="px-6 py-4 text-right text-xs text-muted-foreground">
                        {formatDate(enrollment.completedAt)}
                      </td>
                    </tr>
                  ))}
                  {(enrollments.data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                        No enrollment records found.
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
