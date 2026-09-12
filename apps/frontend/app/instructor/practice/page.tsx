'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type InstructorPracticeProblem, type PaginatedResponse, requestJson } from '../../../lib/api';

export default function InstructorPracticePage() {
  const problems = useQuery({
    queryKey: ['instructor-practice'],
    queryFn: () => requestJson<PaginatedResponse<InstructorPracticeProblem>>('/instructor/practice/problems?page=1&limit=50'),
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Instructor Practice</h1>
        <Link className="rounded-md bg-primary px-4 py-2 text-primary-foreground" href="/instructor/practice/new">
          New
        </Link>
      </div>
      <div className="space-y-3">
        {problems.data?.items.map((problem) => (
          <Link key={problem.id} className="block rounded-md border p-4 hover:bg-muted/40" href={`/instructor/practice/${problem.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{problem.title}</h2>
              <span className="rounded-md border px-2 py-1 text-xs">{problem.status}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {problem.slug} · {problem.difficulty} · {problem.testCases.length} tests
            </p>
          </Link>
        ))}
      </div>
      {problems.isLoading ? <p className="text-sm text-muted-foreground">Loading practice problems...</p> : null}
      {problems.isError ? <p className="text-sm text-red-600">Login as instructor first.</p> : null}
    </main>
  );
}
