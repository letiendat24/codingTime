'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type InstructorPracticeProblem, requestJson } from '../../../../lib/api';

export default function NewPracticeProblemPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('EASY');
  const [starterCode, setStarterCode] = useState('const fs = require("fs");\n');

  const create = useMutation({
    mutationFn: () => requestJson<{ readonly problem: InstructorPracticeProblem }>('/instructor/practice/problems', {
      method: 'POST',
      body: JSON.stringify({
        title,
        slug: slug || undefined,
        description,
        difficulty,
        starterFiles: [{ path: 'index.js', content: starterCode }],
        tags: [],
      }),
    }),
    onSuccess: (data) => router.push(`/instructor/practice/${data.problem.id}`),
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <h1 className="mb-8 text-3xl font-semibold">New Practice Problem</h1>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <label className="block text-sm font-medium">
          Title
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Slug
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Difficulty
          <select className="mt-1 w-full rounded-md border px-3 py-2" value={difficulty} onChange={(event) => setDifficulty(event.target.value as 'EASY' | 'MEDIUM' | 'HARD')}>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea className="mt-1 min-h-40 w-full rounded-md border px-3 py-2" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Starter code
          <textarea className="mt-1 min-h-32 w-full rounded-md border px-3 py-2 font-mono text-sm" value={starterCode} onChange={(event) => setStarterCode(event.target.value)} />
        </label>
        <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" disabled={create.isPending} type="submit">
          Create
        </button>
        {create.isError ? <p className="text-sm text-red-600">{create.error.message}</p> : null}
      </form>
    </main>
  );
}
