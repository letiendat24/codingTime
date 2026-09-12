'use client';

import { useQuery } from '@tanstack/react-query';
import { type LearningActivity, requestJson } from '../../lib/api';

interface LearningHistoryResponse {
  readonly items: readonly LearningActivity[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
  };
}

export default function LearningHistoryPage() {
  const history = useQuery({
    queryKey: ['learning-history'],
    queryFn: () => requestJson<LearningHistoryResponse>('/learning/history?page=1&limit=20'),
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Learning History</h1>
      <div className="mt-8 space-y-3">
        {history.data?.items.map((activity) => (
          <article key={activity.id} className="rounded-md border p-4">
            <p className="text-sm font-medium">{activity.type.replaceAll('_', ' ')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activity.lesson?.title ?? activity.course?.title ?? 'Learning activity'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</p>
          </article>
        ))}
      </div>
      {history.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading history...</p> : null}
      {history.isError ? <p className="mt-4 text-sm text-red-600">Login first, then retry this page.</p> : null}
    </main>
  );
}
