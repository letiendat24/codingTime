'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Search, UserCheck, UserX } from 'lucide-react';
import { type AdminUserSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, FilterForm, SelectInput, StatusBadge, TextInput, formatDate } from '../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
import { Button } from '../../../design-system/components/button';
import { LoadingState } from '../../../design-system/components/loading-state';
import { Badge } from '../../../design-system/components/badge';

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(search ? { search } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
  }).toString();

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
  }

  if (users.isError) return <AdminError message={users.error instanceof Error ? users.error.message : undefined} />;

  return (
    <div className="space-y-6">
      <FilterForm onSubmit={applyFilters}>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <TextInput
            placeholder="Search email or name..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SelectInput value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">All Roles</option>
          <option value="STUDENT">Student</option>
          <option value="INSTRUCTOR">Instructor</option>
          <option value="ADMIN">Admin</option>
        </SelectInput>
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DISABLED">Disabled</option>
        </SelectInput>
      </FilterForm>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Accounts</CardTitle>
              <CardDescription>
                Manage platform accounts, roles, and suspension states.
              </CardDescription>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              Total: {users.data?.pagination.total ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {users.isLoading ? (
            <div className="py-12">
              <LoadingState message="Loading users..." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3.5">User</th>
                    <th className="px-6 py-3.5">Roles</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Created At</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(users.data?.items ?? []).map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {user.displayName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs font-normal">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge value={user.status} />
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {user.status === 'ACTIVE' ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              statusMutation.mutate({ userId: user.id, nextStatus: 'SUSPENDED' })
                            }
                            isLoading={statusMutation.isPending && statusMutation.variables?.userId === user.id}
                            leftIcon={<UserX className="h-3.5 w-3.5" />}
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              statusMutation.mutate({ userId: user.id, nextStatus: 'ACTIVE' })
                            }
                            isLoading={statusMutation.isPending && statusMutation.variables?.userId === user.id}
                            leftIcon={<UserCheck className="h-3.5 w-3.5" />}
                          >
                            Activate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(users.data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">
                        No users match the specified criteria.
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
