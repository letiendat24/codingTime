'use client';

import { useQuery } from '@tanstack/react-query';
import { type AdminEnrollmentSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../admin-components';

export default function AdminEnrollmentsPage() {
  const enrollments = useQuery({
    queryKey: ['admin-enrollments'],
    queryFn: () => requestJson<PaginatedResponse<AdminEnrollmentSummary>>('/admin/enrollments?page=1&limit=50'),
    retry: false,
  });

  if (enrollments.isError) return <AdminError />;

  return (
    <section>
      <h2 className="text-xl font-semibold">Enrollments</h2>
      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Student</th>
              <th className="p-3">Course</th>
              <th className="p-3">Status</th>
              <th className="p-3">Progress</th>
              <th className="p-3">Enrolled</th>
              <th className="p-3">Completed</th>
            </tr>
          </thead>
          <tbody>
            {(enrollments.data?.items ?? []).map((enrollment) => (
              <tr key={enrollment.id} className="border-t">
                <td className="p-3">{enrollment.student.email}</td>
                <td className="p-3">{enrollment.course.title}</td>
                <td className="p-3"><StatusBadge value={enrollment.status} /></td>
                <td className="p-3">{enrollment.progressPercent ?? 0}%</td>
                <td className="p-3">{formatDate(enrollment.enrolledAt)}</td>
                <td className="p-3">{formatDate(enrollment.completedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
