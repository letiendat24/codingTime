'use client';

import { useQuery } from '@tanstack/react-query';
import { type AdminDashboard, requestJson } from '../../lib/api';
import { AdminError, MetricCard, StatusBadge, formatDate } from './admin-components';

export default function AdminDashboardPage() {
  const dashboard = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => requestJson<AdminDashboard>('/admin/dashboard?period=7d'),
    retry: false,
  });

  if (dashboard.isError) {
    return <AdminError />;
  }

  const data = dashboard.data;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold">Platform Dashboard</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Users" value={data?.users.total ?? 0} />
          <MetricCard label="Students" value={data?.users.students ?? 0} />
          <MetricCard label="Instructors" value={data?.users.instructors ?? 0} />
          <MetricCard label="Courses" value={data?.courses.total ?? 0} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border p-4">
          <h3 className="font-semibold">Course & Enrollment</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Published" value={data?.courses.published ?? 0} />
            <MetricCard label="Draft" value={data?.courses.draft ?? 0} />
            <MetricCard label="Archived" value={data?.courses.archived ?? 0} />
            <MetricCard label="Enrollments" value={data?.courses.enrollments ?? 0} />
          </div>
        </div>
        <div className="rounded-md border p-4">
          <h3 className="font-semibold">Operations</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Failed Videos" value={data?.operations.videos.failed ?? 0} />
            <MetricCard label="Running Executions" value={data?.operations.codeExecutions.running ?? 0} />
            <MetricCard label="Judge Queued" value={data?.operations.judgeSubmissions.queued ?? 0} />
            <MetricCard label="Projects Awaiting Review" value={data?.operations.projectGrading.awaitingReview ?? 0} />
          </div>
        </div>
      </section>

      <section className="rounded-md border p-4">
        <h3 className="font-semibold">Platform Health</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(data?.health ?? {}).map(([name, status]) => (
            <span key={name} className="text-sm">
              {name}: <StatusBadge value={status} />
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-semibold">Recent Activity</h3>
        <div className="mt-3 overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Activity</th>
                <th className="p-3">Context</th>
                <th className="p-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentActivity ?? []).map((activity) => (
                <tr key={activity.id} className="border-t">
                  <td className="p-3">{activity.user.email}</td>
                  <td className="p-3">{activity.type.replaceAll('_', ' ')}</td>
                  <td className="p-3">{activity.lesson?.title ?? activity.course?.title ?? '-'}</td>
                  <td className="p-3">{formatDate(activity.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dashboard.isLoading ? <p className="text-sm text-muted-foreground">Loading admin dashboard...</p> : null}
    </div>
  );
}
