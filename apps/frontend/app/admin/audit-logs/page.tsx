'use client';

import { useQuery } from '@tanstack/react-query';
import { type AdminAuditLogSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
import { LoadingState } from '../../../design-system/components/loading-state';

function metadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return '—';
  }

  const record = metadata as Record<string, unknown>;
  const entries = Object.entries(record).filter(
    ([key]) => key === 'reason' || key.startsWith('previous') || key.startsWith('new')
  );

  if (entries.length === 0) return '—';

  return (
    <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
      {entries.map(([key, value]) => (
        <span key={key} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
          <span className="font-semibold text-foreground">{key}:</span> {String(value)}
        </span>
      ))}
    </div>
  );
}

export default function AdminAuditLogsPage() {
  const auditLogs = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => requestJson<PaginatedResponse<AdminAuditLogSummary>>('/admin/audit-logs?page=1&limit=50'),
    retry: false,
  });

  if (auditLogs.isError) return <AdminError message={auditLogs.error instanceof Error ? auditLogs.error.message : undefined} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Administrative Audit Trail</CardTitle>
              <CardDescription>
                Immutable log of all administrative actions, suspensions, role modifications, and oversight decisions.
              </CardDescription>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              Total: {auditLogs.data?.pagination.total ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {auditLogs.isLoading ? (
            <div className="py-12">
              <LoadingState message="Loading audit logs..." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3.5">Admin User</th>
                    <th className="px-6 py-3.5">Action Executed</th>
                    <th className="px-6 py-3.5">Target Entity</th>
                    <th className="px-6 py-3.5">Metadata / Reason</th>
                    <th className="px-6 py-3.5 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(auditLogs.data?.items ?? []).map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4 font-medium text-foreground">{log.admin.email}</td>
                      <td className="px-6 py-4">
                        <StatusBadge value={log.action} />
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {log.targetType}:{log.targetId}
                      </td>
                      <td className="px-6 py-4">{metadataSummary(log.metadata)}</td>
                      <td className="px-6 py-4 text-right text-xs text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                  {(auditLogs.data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">
                        No audit log entries recorded.
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
