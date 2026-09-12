'use client';

import { useQuery } from '@tanstack/react-query';
import { type AdminAuditLogSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../admin-components';

function metadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return '-';
  }

  const record = metadata as Record<string, unknown>;
  return Object.entries(record)
    .filter(([key]) => key === 'reason' || key.startsWith('previous') || key.startsWith('new'))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ') || '-';
}

export default function AdminAuditLogsPage() {
  const auditLogs = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => requestJson<PaginatedResponse<AdminAuditLogSummary>>('/admin/audit-logs?page=1&limit=50'),
    retry: false,
  });

  if (auditLogs.isError) return <AdminError />;

  return (
    <section>
      <h2 className="text-xl font-semibold">Audit Logs</h2>
      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Admin</th>
              <th className="p-3">Action</th>
              <th className="p-3">Target</th>
              <th className="p-3">Metadata</th>
              <th className="p-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {(auditLogs.data?.items ?? []).map((log) => (
              <tr key={log.id} className="border-t">
                <td className="p-3">{log.admin.email}</td>
                <td className="p-3"><StatusBadge value={log.action} /></td>
                <td className="p-3">{log.targetType}:{log.targetId}</td>
                <td className="p-3">{metadataSummary(log.metadata)}</td>
                <td className="p-3">{formatDate(log.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
