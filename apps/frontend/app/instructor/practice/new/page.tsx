'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Code2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { type InstructorPracticeProblem, requestJson } from '../../../../lib/api';
import { PageHeader } from '../../../../design-system/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../design-system/components/card';
import { Button } from '../../../../design-system/components/button';
import { Input } from '../../../../design-system/components/input';
import { Textarea } from '../../../../design-system/components/textarea';
import { Select } from '../../../../design-system/components/select';

export default function NewPracticeProblemPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('EASY');
  const [starterCode, setStarterCode] = useState('function solution(input) {\n  // Write your code here\n  return input;\n}\n\nmodule.exports = { solution };\n');

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
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/instructor/practice"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Practice Problems
        </Link>
        <PageHeader
          title="Create Practice Problem"
          description="Design an interactive coding challenge with automated test validation for your students."
          breadcrumbs={[
            { label: 'Instructor', href: '/instructor/courses' },
            { label: 'Practice', href: '/instructor/practice' },
            { label: 'New Problem' },
          ]}
        />
      </div>

      <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Specify the title, unique slug identifier, and challenge difficulty.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Problem Title <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  placeholder="e.g. Reverse Linked List"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Slug URL (Optional)
                </label>
                <Input
                  placeholder="e.g. reverse-linked-list"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Difficulty Level <span className="text-destructive">*</span>
              </label>
              <Select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                options={[
                  { label: 'Easy — Introductory challenge', value: 'EASY' },
                  { label: 'Medium — Intermediate problem solving', value: 'MEDIUM' },
                  { label: 'Hard — Complex algorithms & edge cases', value: 'HARD' },
                ]}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Problem Description (Markdown supported) <span className="text-destructive">*</span>
              </label>
              <Textarea
                required
                className="min-h-40 font-mono text-sm"
                placeholder="Explain the problem statement, constraints, input/output formats, and sample test cases..."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              <CardTitle>Starter Code Template</CardTitle>
            </div>
            <CardDescription>The initial file boilerplate students see in their IDE editor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Textarea
                className="min-h-44 font-mono text-sm leading-relaxed"
                value={starterCode}
                onChange={(event) => setStarterCode(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {create.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to create problem: {create.error instanceof Error ? create.error.message : 'Unknown error'}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => router.push('/instructor/practice')}>
            Cancel
          </Button>
          <Button type="submit" isLoading={create.isPending} leftIcon={<Sparkles className="h-4 w-4" />}>
            Create & Add Test Cases
          </Button>
        </div>
      </form>
    </div>
  );
}
