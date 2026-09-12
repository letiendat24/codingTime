'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { type InstructorPracticeProblem, requestJson } from '../../../../lib/api';

interface ProblemResponse {
  readonly problem: InstructorPracticeProblem;
}

export default function InstructorPracticeDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [testName, setTestName] = useState('Sample');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'HIDDEN'>('PUBLIC');
  const [input, setInput] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [weight, setWeight] = useState(100);

  const detail = useQuery({
    queryKey: ['instructor-practice', params.id],
    queryFn: () => requestJson<ProblemResponse>(`/instructor/practice/problems/${params.id}`),
  });
  const problem = detail.data?.problem;
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ['instructor-practice', params.id] });

  const addTest = useMutation({
    mutationFn: () => requestJson(`/instructor/practice/problems/${params.id}/test-cases`, {
      method: 'POST',
      body: JSON.stringify({ name: testName, visibility, input, expectedOutput, weight }),
    }),
    onSuccess: () => {
      setInput('');
      setExpectedOutput('');
      void refresh();
    },
  });
  const publish = useMutation({
    mutationFn: () => requestJson(`/instructor/practice/problems/${params.id}/publish`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: () => requestJson(`/instructor/practice/problems/${params.id}/archive`, { method: 'POST' }),
    onSuccess: refresh,
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{problem?.title ?? 'Practice Problem'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{problem ? `${problem.slug} · ${problem.status}` : 'Loading...'}</p>
        </div>
        {problem ? (
          <div className="flex gap-2">
            <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => publish.mutate()} type="button">
              Publish
            </button>
            <button className="rounded-md border px-4 py-2" onClick={() => archive.mutate()} type="button">
              Archive
            </button>
          </div>
        ) : null}
      </div>

      {problem ? (
        <section className="mb-8 rounded-md border p-4">
          <p className="whitespace-pre-wrap text-sm">{problem.description}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {problem.difficulty} · {problem.language} · pass {problem.passScore}%
          </p>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border p-4">
          <h2 className="mb-4 font-semibold">Test Cases</h2>
          <div className="space-y-2">
            {problem?.testCases.map((test) => (
              <div key={test.id} className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">{test.position}. {test.name}</p>
                <p>{test.visibility} · weight {test.weight}</p>
                <pre className="mt-2 whitespace-pre-wrap">Input: {test.input || '(empty)'}</pre>
                <pre className="whitespace-pre-wrap">Expected: {test.expectedOutput}</pre>
              </div>
            ))}
          </div>
        </div>

        <form className="rounded-md border p-4" onSubmit={(event) => { event.preventDefault(); addTest.mutate(); }}>
          <h2 className="mb-4 font-semibold">Add Test Case</h2>
          <label className="block text-sm font-medium">
            Name
            <input className="mt-1 w-full rounded-md border px-3 py-2" value={testName} onChange={(event) => setTestName(event.target.value)} />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Visibility
            <select className="mt-1 w-full rounded-md border px-3 py-2" value={visibility} onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'HIDDEN')}>
              <option value="PUBLIC">Public</option>
              <option value="HIDDEN">Hidden</option>
            </select>
          </label>
          <label className="mt-3 block text-sm font-medium">
            Input
            <textarea className="mt-1 min-h-20 w-full rounded-md border px-3 py-2 font-mono text-sm" value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Expected output
            <textarea className="mt-1 min-h-20 w-full rounded-md border px-3 py-2 font-mono text-sm" value={expectedOutput} onChange={(event) => setExpectedOutput(event.target.value)} />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Weight
            <input className="mt-1 w-full rounded-md border px-3 py-2" type="number" value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
          </label>
          <button className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground" type="submit">
            Add Test
          </button>
          {addTest.isError || publish.isError || archive.isError ? <p className="mt-3 text-sm text-red-600">Action failed.</p> : null}
        </form>
      </section>
    </main>
  );
}
