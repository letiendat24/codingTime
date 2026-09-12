'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type AdminCourseSummary, type AdminUserDetail, requestJson } from '../../../../lib/api';
import { AdminError, StatusBadge } from '../../admin-components';

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

  if (detail.isError) return <AdminError />;

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Instructor Detail</h2>
      <div className="rounded-md border p-4">
        <p className="text-lg font-medium">{detail.data?.instructor.displayName}</p>
        <p className="text-sm text-muted-foreground">{detail.data?.instructor.email}</p>
        <div className="mt-3 flex gap-2">
          {detail.data?.instructor.roles.map((role) => <StatusBadge key={role} value={role} />)}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Course</th>
              <th className="p-3">Status</th>
              <th className="p-3">Lessons</th>
              <th className="p-3">Enrollments</th>
            </tr>
          </thead>
          <tbody>
            {(detail.data?.courses ?? []).map((course) => (
              <tr key={course.id} className="border-t">
                <td className="p-3"><Link className="text-primary" href={`/admin/courses/${course.id}`}>{course.title}</Link></td>
                <td className="p-3"><StatusBadge value={course.status} /></td>
                <td className="p-3">{course.lessonCount}</td>
                <td className="p-3">{course.enrollmentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
