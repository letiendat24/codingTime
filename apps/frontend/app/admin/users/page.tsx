'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { type AdminUserSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, FilterForm, SelectInput, StatusBadge, TextInput, formatDate } from '../admin-components';

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('page=1&limit=20');
  const users = useQuery({
    queryKey: ['admin-users', query],
    queryFn: () => requestJson<PaginatedResponse<AdminUserSummary>>(`/admin/users?${query}`),
    retry: false,
  });
  const statusMutation = useMutation({
    mutationFn: ({ userId, nextStatus }: { userId: string; nextStatus: string }) =>
      requestJson(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, reason: 'admin console action' }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams({ page: '1', limit: '20' });
    if (search) params.set('search', search);
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    setQuery(params.toString());
  }

  if (users.isError) return <AdminError />;

  return (
    <section>
      <h2 className="text-xl font-semibold">Users</h2>
      <FilterForm onSubmit={applyFilters}>
        <TextInput placeholder="Search email or name" value={search} onChange={(event) => setSearch(event.target.value)} />
        <SelectInput value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">Any role</option>
          <option value="STUDENT">Student</option>
          <option value="INSTRUCTOR">Instructor</option>
          <option value="ADMIN">Admin</option>
        </SelectInput>
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DISABLED">Disabled</option>
        </SelectInput>
      </FilterForm>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users.data?.items ?? []).map((user) => (
              <tr key={user.id} className="border-t">
                <td className="p-3">
                  <Link className="text-primary" href={`/admin/users/${user.id}`}>
                    {user.displayName}
                  </Link>
                </td>
                <td className="p-3">{user.email}</td>
                <td className="p-3">{user.roles.join(', ')}</td>
                <td className="p-3"><StatusBadge value={user.status} /></td>
                <td className="p-3">{formatDate(user.createdAt)}</td>
                <td className="space-x-2 p-3">
                  {user.status === 'ACTIVE' ? (
                    <button className="rounded-md border px-2 py-1" onClick={() => statusMutation.mutate({ userId: user.id, nextStatus: 'SUSPENDED' })}>
                      Suspend
                    </button>
                  ) : (
                    <button className="rounded-md border px-2 py-1" onClick={() => statusMutation.mutate({ userId: user.id, nextStatus: 'ACTIVE' })}>
                      Activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Total: {users.data?.pagination.total ?? 0}</p>
    </section>
  );
}
