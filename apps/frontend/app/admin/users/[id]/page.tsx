'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ShieldCheck, UserX, UserCheck, Save, History } from 'lucide-react';
import Link from 'next/link';
import { type AdminUserDetail, requestJson } from '../../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../../design-system/components/card';
import { Button } from '../../../../design-system/components/button';
import { Input } from '../../../../design-system/components/input';
import { Badge } from '../../../../design-system/components/badge';
import { LoadingState } from '../../../../design-system/components/loading-state';

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [rolesText, setRolesText] = useState('');
  const [isRolesInitialized, setIsRolesInitialized] = useState(false);

  const user = useQuery({
    queryKey: ['admin-user', params.id],
    queryFn: async () => {
      const body = await requestJson<{ user: AdminUserDetail }>(`/admin/users/${params.id}`);
      if (!isRolesInitialized) {
        setRolesText(body.user.roles.join(', '));
        setIsRolesInitialized(true);
      }
      return body.user;
    },
    retry: false,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      requestJson(`/admin/users/${params.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: 'admin detail action' }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-user', params.id] }),
  });

  const roleMutation = useMutation({
    mutationFn: () =>
      requestJson(`/admin/users/${params.id}/roles`, {
        method: 'PUT',
        body: JSON.stringify({
          roles: rolesText.split(',').map((role) => role.trim()).filter(Boolean),
          reason: 'admin detail role update',
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-user', params.id] }),
  });

  if (user.isError) return <AdminError message={user.error instanceof Error ? user.error.message : undefined} />;
  if (user.isLoading) {
    return (
      <div className="py-16">
        <LoadingState message="Loading user details..." />
      </div>
    );
  }

  const detail = user.data;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* User Identity Card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                {detail?.displayName?.charAt(0) ?? 'U'}
              </div>
              <div>
                <CardTitle className="text-lg">{detail?.displayName}</CardTitle>
                <CardDescription>{detail?.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Account Status</span>
              {detail ? <StatusBadge value={detail.status} /> : null}
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Assigned Roles</span>
              <div className="flex flex-wrap gap-1">
                {(detail?.roles ?? []).map((role) => (
                  <Badge key={role} variant="outline" className="text-xs">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Active Sessions</span>
              <span className="font-semibold">{detail?.activeSessionCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Course Enrollments</span>
              <span className="font-semibold">{detail?.enrollmentCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Owned Courses</span>
              <span className="font-semibold">{detail?.ownedCourseCount ?? 0}</span>
            </div>

            <div className="pt-4 border-t space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Account Actions</p>
              <div className="flex gap-2">
                {detail?.status === 'ACTIVE' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => statusMutation.mutate('SUSPENDED')}
                    isLoading={statusMutation.isPending}
                    leftIcon={<UserX className="h-4 w-4" />}
                  >
                    Suspend Account
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => statusMutation.mutate('ACTIVE')}
                    isLoading={statusMutation.isPending}
                    leftIcon={<UserCheck className="h-4 w-4" />}
                  >
                    Activate Account
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Roles & Activity Management */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Role Permissions</CardTitle>
              </div>
              <CardDescription>
                Assign or revoke roles (STUDENT, INSTRUCTOR, ADMIN) separated by commas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  className="flex-1"
                  value={rolesText}
                  onChange={(event) => setRolesText(event.target.value)}
                  placeholder="e.g. STUDENT, INSTRUCTOR, ADMIN"
                />
                <Button
                  onClick={() => roleMutation.mutate()}
                  isLoading={roleMutation.isPending}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Save Roles
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <CardTitle>User Activity History</CardTitle>
              </div>
              <CardDescription>Recent learning and system actions performed by this user</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(detail?.recentActivity ?? []).map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
                    <div className="space-y-1">
                      <span className="font-mono text-xs font-semibold uppercase text-primary">
                        {activity.type.replaceAll('_', ' ')}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {activity.courseTitle ?? activity.lessonTitle ?? 'System action'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(activity.createdAt)}</span>
                  </div>
                ))}
                {(!detail?.recentActivity || detail.recentActivity.length === 0) && (
                  <p className="text-center text-sm text-muted-foreground py-6">No recent activity recorded.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
