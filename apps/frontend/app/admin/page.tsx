'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Users,
  GraduationCap,
  BookOpen,
  UserCheck,
  Video,
  Terminal,
  Scale,
  FolderGit2,
  HeartPulse,
  History,
} from 'lucide-react';
import { type AdminDashboard, requestJson } from '../../lib/api';
import { AdminError, MetricCard, StatusBadge, formatDate } from './admin-components';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../design-system/components/card';
import { LoadingState } from '../../design-system/components/loading-state';

export default function AdminDashboardPage() {
  const dashboard = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => requestJson<AdminDashboard>('/admin/dashboard?period=7d'),
    retry: false,
  });

  if (dashboard.isError) {
    return <AdminError message={dashboard.error instanceof Error ? dashboard.error.message : undefined} />;
  }

  if (dashboard.isLoading) {
    return (
      <div className="py-16">
        <LoadingState title="Loading Telemetry" message="Gathering system analytics, queue status, and health checks..." />
      </div>
    );
  }

  const data = dashboard.data;

  return (
    <div className="space-y-8">
      {/* Primary KPI row */}
      <div>
        <h3 className="mb-4 text-base font-semibold text-foreground">Platform Growth & Users (7 Days)</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Users"
            value={data?.users.total ?? 0}
            description={`${data?.users.students ?? 0} students · ${data?.users.instructors ?? 0} instructors`}
            icon={<Users className="h-5 w-5" />}
          />
          <MetricCard
            label="Active Courses"
            value={data?.courses.total ?? 0}
            description={`${data?.courses.published ?? 0} published · ${data?.courses.draft ?? 0} drafts`}
            icon={<BookOpen className="h-5 w-5" />}
          />
          <MetricCard
            label="Total Enrollments"
            value={data?.courses.enrollments ?? 0}
            description="Across all courses"
            icon={<UserCheck className="h-5 w-5" />}
          />
          <MetricCard
            label="Instructors"
            value={data?.users.instructors ?? 0}
            description="Content creators"
            icon={<GraduationCap className="h-5 w-5" />}
          />
        </div>
      </div>

      {/* Operational Queues & System Health */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              <CardTitle>Operational Queue Telemetry</CardTitle>
            </div>
            <CardDescription>Live asynchronous worker queue states</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2.5">
                <Video className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Failed Videos</span>
              </div>
              <span className={`text-sm font-bold ${(data?.operations.videos.failed ?? 0) > 0 ? 'text-destructive' : 'text-foreground'}`}>
                {data?.operations.videos.failed ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2.5">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Running Sandbox</span>
              </div>
              <span className="text-sm font-bold text-foreground">
                {data?.operations.codeExecutions.running ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2.5">
                <Scale className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Judge Queued</span>
              </div>
              <span className="text-sm font-bold text-foreground">
                {data?.operations.judgeSubmissions.queued ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2.5">
                <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Projects Awaiting</span>
              </div>
              <span className="text-sm font-bold text-foreground">
                {data?.operations.projectGrading.awaitingReview ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-emerald-500" />
              <CardTitle>Platform Infrastructure Health</CardTitle>
            </div>
            <CardDescription>Database, cache, and queue cluster connectivity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data?.health ?? {}).map(([service, status]) => (
                <div key={service} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {service}
                  </span>
                  <StatusBadge value={status} />
                </div>
              ))}
              {(!data?.health || Object.keys(data.health).length === 0) && (
                <div className="text-sm text-muted-foreground">All subsystem services reporting normal operations.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle>Recent Platform Activity</CardTitle>
          </div>
          <CardDescription>Live student and instructor learning actions across courses</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3.5">User Email</th>
                  <th className="px-6 py-3.5">Action Event</th>
                  <th className="px-6 py-3.5">Target Course / Lesson</th>
                  <th className="px-6 py-3.5 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.recentActivity ?? []).map((activity) => (
                  <tr key={activity.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium text-foreground">{activity.user.email}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                        {activity.type.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {activity.lesson?.title ?? activity.course?.title ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-muted-foreground">
                      {formatDate(activity.createdAt)}
                    </td>
                  </tr>
                ))}
                {(!data?.recentActivity || data.recentActivity.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      No recent activity records found.
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
