'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type AdminInstructorSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../admin-components';

export default function AdminInstructorsPage() {
  const instructors = useQuery({
    queryKey: ['admin-instructors'],
    queryFn: () => requestJson<PaginatedResponse<AdminInstructorSummary>>('/admin/instructors?page=1&limit=50'),
    retry: false,
  });

  if (instructors.isError) return <AdminError />;

  return (
    <section>
      <h2 className="text-xl font-semibold">Instructors</h2>
      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Instructor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Courses</th>
              <th className="p-3">Published</th>
              <th className="p-3">Enrollments</th>
              <th className="p-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(instructors.data?.items ?? []).map((instructor) => (
              <tr key={instructor.id} className="border-t">
                <td className="p-3">
                  <Link className="text-primary" href={`/admin/instructors/${instructor.id}`}>
                    {instructor.displayName}
                  </Link>
                  <p className="text-muted-foreground">{instructor.email}</p>
                </td>
                <td className="p-3"><StatusBadge value={instructor.status} /></td>
                <td className="p-3">{instructor.courseCount}</td>
                <td className="p-3">{instructor.publishedCourseCount}</td>
                <td className="p-3">{instructor.enrollmentCount}</td>
                <td className="p-3">{formatDate(instructor.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
