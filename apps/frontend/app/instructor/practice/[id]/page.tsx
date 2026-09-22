'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Archive,
  Plus,
  Eye,
  EyeOff,
  FileCode,
  AlertCircle,
  Save,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { type InstructorPracticeProblem, requestJson } from '../../../../lib/api';
import { PageHeader } from '../../../../design-system/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../design-system/components/card';
import { Button } from '../../../../design-system/components/button';
import { Input } from '../../../../design-system/components/input';
import { Textarea } from '../../../../design-system/components/textarea';
import { Select } from '../../../../design-system/components/select';
import { Badge } from '../../../../design-system/components/badge';
import { StatusBadge } from '../../../../design-system/components/status-badge';
import { LoadingState } from '../../../../design-system/components/loading-state';
import { ErrorState } from '../../../../design-system/components/error-state';
import { EmptyState } from '../../../../design-system/components/empty-state';

interface ProblemResponse {
  readonly problem: InstructorPracticeProblem;
}

export default function InstructorPracticeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [testName, setTestName] = useState('Sample Case');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'HIDDEN'>('PUBLIC');
  const [input, setInput] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [weight, setWeight] = useState(10);
  const [actionError, setActionError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [constraints, setConstraints] = useState('');
  const [starterCode, setStarterCode] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [importPayload, setImportPayload] = useState('{\n  "version": 1,\n  "mode": "APPEND",\n  "testCases": []\n}');

  const detail = useQuery({
    queryKey: ['instructor-practice', params.id],
    queryFn: () => requestJson<ProblemResponse>(`/instructor/practice/problems/${params.id}`),
    enabled: Boolean(params.id),
  });

  const problem = detail.data?.problem;
  useEffect(() => {
    if (!problem) return;
    setDescription(problem.description);
    setInputFormat(problem.inputFormat);
    setOutputFormat(problem.outputFormat);
    setConstraints(problem.constraints);
    setStarterCode(problem.starterFiles[0]?.content ?? '');
    setReferenceCode(problem.referenceFiles[0]?.content ?? '');
  }, [problem?.id]);

  const refresh = async () => {
    setActionError(null);
    return queryClient.invalidateQueries({ queryKey: ['instructor-practice', params.id] });
  };

  const updateProblem = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/practice/problems/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          description,
          inputFormat,
          outputFormat,
          constraints,
          starterFiles: [{ path: problem?.entryFile ?? 'index.js', content: starterCode }],
          referenceFiles: [{ path: problem?.entryFile ?? 'index.js', content: referenceCode }],
        }),
      }),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to update problem'),
  });

  const addTest = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/practice/problems/${params.id}/test-cases`, {
        method: 'POST',
        body: JSON.stringify({ name: testName, visibility, input, expectedOutput, weight }),
      }),
    onSuccess: () => {
      setInput('');
      setExpectedOutput('');
      setTestName('Sample Case ' + ((problem?.testCases.length ?? 0) + 1));
      void refresh();
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to add test case'),
  });

  const publish = useMutation({
    mutationFn: () => requestJson(`/instructor/practice/problems/${params.id}/publish`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to publish problem'),
  });

  const validate = useMutation({
    mutationFn: () =>
      requestJson<{
        readonly valid: boolean;
        readonly issues: readonly string[];
      }>(`/instructor/practice/problems/${params.id}/validate`, { method: 'POST' }),
    onSuccess: (data) => {
      setActionError(data.valid ? null : data.issues.join('\n'));
      void refresh();
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to validate problem'),
  });

  const importTests = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/practice/problems/${params.id}/test-cases/import`, {
        method: 'POST',
        body: importPayload,
      }),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to import tests'),
  });

  const archive = useMutation({
    mutationFn: () => requestJson(`/instructor/practice/problems/${params.id}/archive`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to archive problem'),
  });

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <LoadingState title="Loading Practice Problem" message="Fetching problem details and automated test cases..." />
      </div>
    );
  }

  if (detail.isError || !problem) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <ErrorState
          title="Problem Not Found"
          message={detail.error instanceof Error ? detail.error.message : 'Unable to load practice problem.'}
          action={<Button onClick={() => router.push('/instructor/practice')}>Back to List</Button>}
        />
      </div>
    );
  }

  const difficultyToneMap = {
    EASY: 'success' as const,
    MEDIUM: 'warning' as const,
    HARD: 'danger' as const,
  };

  const statusToneMap = {
    PUBLISHED: 'success' as const,
    DRAFT: 'neutral' as const,
    ARCHIVED: 'warning' as const,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/instructor/practice"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Practice Problems
        </Link>
        <PageHeader
          title={problem.title}
          description={`Slug: ${problem.slug} · Language: ${problem.language} · Pass threshold: ${problem.passScore}%`}
          breadcrumbs={[
            { label: 'Instructor', href: '/instructor/courses' },
            { label: 'Practice', href: '/instructor/practice' },
            { label: problem.title },
          ]}
          actions={
            <div className="flex items-center gap-3">
              <StatusBadge tone={statusToneMap[problem.status as keyof typeof statusToneMap] ?? 'neutral'}>
                {problem.status}
              </StatusBadge>
              {problem.status !== 'PUBLISHED' ? (
                <>
                <Button
                  variant="outline"
                  onClick={() => validate.mutate()}
                  isLoading={validate.isPending}
                  leftIcon={<ShieldCheck className="h-4 w-4" />}
                >
                  Validate
                </Button>
                <Button
                  onClick={() => publish.mutate()}
                  isLoading={publish.isPending}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Publish Problem
                </Button>
                </>
              ) : null}
              {problem.status !== 'ARCHIVED' ? (
                <Button
                  variant="outline"
                  onClick={() => archive.mutate()}
                  isLoading={archive.isPending}
                  leftIcon={<Archive className="h-4 w-4" />}
                >
                  Archive
                </Button>
              ) : null}
            </div>
          }
        />
      </div>

      {actionError ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Problem Details & Description */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Challenge Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">Difficulty</span>
                <StatusBadge tone={difficultyToneMap[problem.difficulty as keyof typeof difficultyToneMap] ?? 'neutral'}>
                  {problem.difficulty}
                </StatusBadge>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">Language runtime</span>
                <span className="font-mono font-medium">{problem.language}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">Total Test Cases</span>
                <span className="font-semibold">{problem.testCases.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Passing Score</span>
                <span className="font-semibold">{problem.passScore}%</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-muted-foreground">Validation</span>
                <span className="font-semibold">
                  {problem.validatedAt ? `Validated ${new Date(problem.validatedAt).toLocaleString()}` : 'Not validated'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Problem Statement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {problem.status === 'DRAFT' ? (
                <>
                  <Textarea className="min-h-36 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} />
                  <Textarea className="min-h-24 text-sm" value={inputFormat} onChange={(event) => setInputFormat(event.target.value)} placeholder="Input format" />
                  <Textarea className="min-h-24 text-sm" value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)} placeholder="Output format" />
                  <Textarea className="min-h-24 text-sm" value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="Constraints" />
                  <Button
                    type="button"
                    variant="outline"
                    isLoading={updateProblem.isPending}
                    onClick={() => updateProblem.mutate()}
                    leftIcon={<Save className="h-4 w-4" />}
                  >
                    Save Statement & Code
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap leading-relaxed">{problem.description}</div>
                  <div className="rounded-lg bg-muted/40 p-3 text-xs whitespace-pre-wrap"><strong>Input:</strong> {problem.inputFormat}</div>
                  <div className="rounded-lg bg-muted/40 p-3 text-xs whitespace-pre-wrap"><strong>Output:</strong> {problem.outputFormat}</div>
                  <div className="rounded-lg bg-muted/40 p-3 text-xs whitespace-pre-wrap"><strong>Constraints:</strong> {problem.constraints}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {problem.status === 'DRAFT' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Starter & Reference Code</CardTitle>
                <CardDescription>Both files use the current solution(input) JavaScript contract.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">Starter Code</label>
                  <Textarea className="min-h-40 font-mono text-xs" value={starterCode} onChange={(event) => setStarterCode(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">Reference Solution</label>
                  <Textarea className="min-h-40 font-mono text-xs" value={referenceCode} onChange={(event) => setReferenceCode(event.target.value)} />
                </div>
              </CardContent>
            </Card>
          ) : problem.starterFiles?.length ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Starter Template</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {problem.starterFiles.map((file, idx) => (
                  <div key={idx} className="rounded-lg border bg-card p-3">
                    <div className="mb-1 text-xs font-semibold text-muted-foreground">{file.path}</div>
                    <pre className="overflow-x-auto text-xs font-mono text-foreground leading-relaxed">{file.content}</pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right column: Test Cases & Add Test Case Form */}
        <div className="space-y-6 lg:col-span-2">
          {/* Test cases list */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Grading Test Suite</CardTitle>
                  <CardDescription>
                    Test cases executed by the isolated sandbox to validate student submissions.
                  </CardDescription>
                </div>
                <Badge variant="outline">{problem.testCases.length} Cases</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {problem.testCases.length === 0 ? (
                <EmptyState
                  title="No Test Cases Configured"
                  message="Add public and hidden test cases below so the judge engine can evaluate student solutions."
                />
              ) : (
                <div className="space-y-4">
                  {problem.testCases.map((test, index) => (
                    <div
                      key={test.id}
                      className="rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {test.position ?? index + 1}
                          </span>
                          <span className="font-semibold text-foreground text-sm">{test.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={test.visibility === 'PUBLIC' ? 'default' : 'secondary'} className="text-xs">
                            {test.visibility === 'PUBLIC' ? (
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" /> Public
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <EyeOff className="h-3 w-3" /> Hidden
                              </span>
                            )}
                          </Badge>
                          <span className="text-xs font-medium text-muted-foreground">Weight: {test.weight} pts</span>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
                        <div>
                          <span className="font-medium text-muted-foreground">Structured Input:</span>
                          <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted p-2 font-mono text-foreground">
                            {test.input || '<empty>'}
                          </pre>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Expected Return:</span>
                          <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted p-2 font-mono text-foreground">
                            {test.expectedOutput || '<empty>'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {problem.status === 'DRAFT' ? (
            <Card>
              <CardHeader>
                <CardTitle>Import Test Cases</CardTitle>
                <CardDescription>Paste JSON with version, mode, and testCases. Use REPLACE to overwrite existing tests.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  className="min-h-40 font-mono text-xs"
                  value={importPayload}
                  onChange={(event) => setImportPayload(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  isLoading={importTests.isPending}
                  onClick={() => importTests.mutate()}
                >
                  Import Tests
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* Add Test Case Form */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                <CardTitle>Add Test Case</CardTitle>
              </div>
              <CardDescription>
                Define expected inputs and outputs for automated sandbox grading.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  addTest.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Test Case Name</label>
                    <Input
                      required
                      placeholder="e.g. Edge Case: Empty Array"
                      value={testName}
                      onChange={(event) => setTestName(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Visibility</label>
                    <Select
                      value={visibility}
                      onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'HIDDEN')}
                      options={[
                        { label: 'Public (Visible in problem statement)', value: 'PUBLIC' },
                        { label: 'Hidden (Secret evaluation test)', value: 'HIDDEN' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Grading Weight</label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={weight}
                      onChange={(event) => setWeight(Number(event.target.value))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Structured Input JSON</label>
                    <Textarea
                      className="min-h-24 font-mono text-xs"
                      placeholder="JSON value passed to solution(input)..."
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Expected Return JSON</label>
                    <Textarea
                      required
                      className="min-h-24 font-mono text-xs"
                      placeholder="Expected JSON-serializable return value..."
                      value={expectedOutput}
                      onChange={(event) => setExpectedOutput(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" isLoading={addTest.isPending} leftIcon={<Plus className="h-4 w-4" />}>
                    Save Test Case
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
