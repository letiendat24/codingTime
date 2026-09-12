'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { type AdminUserDetail, requestJson } from '../../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../../admin-components';

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [rolesText, setRolesText] = useState('');
  const user = useQuery({
    queryKey: ['admin-user', params.id],
    queryFn: async () => {
      const body = await requestJson<{ user: AdminUserDetail }>(`/admin/users/${params.id}`);
      setRolesText(body.user.roles.join(','));
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

  if (user.isError) return <AdminError />;
  const detail = user.data;

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">User Detail</h2>
      <div className="rounded-md border p-4">
        <p className="text-lg font-medium">{detail?.displayName}</p>
        <p className="text-sm text-muted-foreground">{detail?.email}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(detail?.roles ?? []).map((role) => <StatusBadge key={role} value={role} />)}
          {detail ? <StatusBadge value={detail.status} /> : null}
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Sessions</dt><dd>{detail?.activeSessionCount ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Enrollments</dt><dd>{detail?.enrollmentCount ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Owned courses</dt><dd>{detail?.ownedCourseCount ?? 0}</dd></div>
        </dl>
      </div>

      <div className="rounded-md border p-4">
        <h3 className="font-semibold">Actions</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => statusMutation.mutate('SUSPENDED')}>
            Suspend
          </button>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => statusMutation.mutate('ACTIVE')}>
            Activate
          </button>
          <input className="rounded-md border bg-background px-3 py-2 text-sm" value={rolesText} onChange={(event) => setRolesText(event.target.value)} />
          <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => roleMutation.mutate()}>
            Save Roles
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold">Recent Activity</h3>
        <div className="mt-3 space-y-2">
          {(detail?.recentActivity ?? []).map((activity) => (
            <div key={activity.id} className="rounded-md border p-3 text-sm">
              {activity.type.replaceAll('_', ' ')} · {activity.courseTitle ?? activity.lessonTitle ?? '-'} · {formatDate(activity.createdAt)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
