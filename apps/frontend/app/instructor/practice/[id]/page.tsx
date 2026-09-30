'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileCode,
  FlaskConical,
  MoreHorizontal,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../../../design-system/components/badge';
import { Button } from '../../../../design-system/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../design-system/components/card';
import { Dropdown } from '../../../../design-system/components/dropdown';
import { EmptyState } from '../../../../design-system/components/empty-state';
import { ErrorState } from '../../../../design-system/components/error-state';
import { Input } from '../../../../design-system/components/input';
import { LoadingState } from '../../../../design-system/components/loading-state';
import { PageHeader } from '../../../../design-system/components/page-header';
import { Select } from '../../../../design-system/components/select';
import { StatusBadge } from '../../../../design-system/components/status-badge';
import { Tabs } from '../../../../design-system/components/tabs';
import { Textarea } from '../../../../design-system/components/textarea';
import {
  type ExecutionDetail,
  type InstructorPracticeProblem,
  type PracticeGeneratedTestPreview,
  type PracticeGeneratedTestsCommitResponse,
  type PracticeHiddenTestsDeleteResponse,
  type PracticeTestGenerationPreviewResponse,
  requestJson,
} from '../../../../lib/api';

interface ProblemResponse {
  readonly problem: InstructorPracticeProblem;
}

interface ExecutionResponse {
  readonly execution: ExecutionDetail;
}

type AuthoringTab = 'problem' | 'code' | 'tests' | 'preview';
type GeneratedSource = 'EXAMPLE' | 'IMPORT' | 'GENERATOR';
type CommitMode = 'APPEND' | 'REPLACE_HIDDEN';
type TestAuthoringTool = 'PUBLIC_EXAMPLE' | 'IMPORT_HIDDEN' | 'GENERATOR' | 'ADVANCED';

const defaultImportPayload = '{\n  "version": 1,\n  "visibility": "HIDDEN",\n  "tests": [\n    {\n      "name": "Hidden case 1",\n      "input": { "value": "example" },\n      "weight": 1\n    }\n  ]\n}';
const defaultPublicExampleInput = '{\n  "value": "example"\n}';

const defaultManualImportPayload = '{\n  "version": 1,\n  "mode": "APPEND",\n  "testCases": []\n}';

const defaultGeneratorSource = `function generateTests() {
  return [
    { value: 'example' },
  ];
}

module.exports = { generateTests };
`;

function parseGeneratedTests(stdout: string): readonly PracticeGeneratedTestPreview[] {
  try {
    const parsed = JSON.parse(stdout) as { readonly tests?: readonly unknown[] };
    if (!Array.isArray(parsed.tests)) {
      return [];
    }

    return parsed.tests.map((item, index) => {
      const candidate = item as {
        readonly name?: unknown;
        readonly input?: unknown;
        readonly weight?: unknown;
        readonly expectedOutput?: unknown;
      };
      return {
        name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : `Generated Test ${index + 1}`,
        input: candidate.input,
        weight: typeof candidate.weight === 'number' ? candidate.weight : 1,
        expectedOutput: typeof candidate.expectedOutput === 'string' ? candidate.expectedOutput : '',
      };
    });
  } catch {
    return [];
  }
}

function generationErrorTitle(errorCode: string | null | undefined, source: GeneratedSource) {
  switch (errorCode) {
    case 'GENERATOR_EXECUTION_FAILED':
      return 'Generator Execution Failed';
    case 'GENERATOR_CONTRACT_INVALID':
      return 'Generator Contract Invalid';
    case 'GENERATOR_OUTPUT_LIMIT_EXCEEDED':
      return 'Generator Output Too Large';
    case 'REFERENCE_SOLUTION_FAILED':
      return 'Reference Solution Failed';
    case 'REFERENCE_SOLUTION_TIMEOUT':
      return 'Reference Solution Timed Out';
    case 'EXECUTION_WORKER_FAILED':
      return 'Execution Worker Failed';
    case 'EXECUTION_RESULT_INVALID':
      return 'Execution Result Invalid';
    default:
      return source === 'GENERATOR' ? 'Generator Preview Failed' : 'Reference Solution Error';
  }
}

function generationErrorMessage(errorCode: string | null | undefined, stderr: string | undefined) {
  if (stderr?.trim()) {
    return stderr.trim();
  }

  switch (errorCode) {
    case 'GENERATOR_EXECUTION_FAILED':
      return 'Generator script failed while running.';
    case 'GENERATOR_CONTRACT_INVALID':
      return 'generateTests() must return an array.';
    case 'GENERATOR_OUTPUT_LIMIT_EXCEEDED':
      return 'Generated payload exceeds the configured output limit.';
    case 'REFERENCE_SOLUTION_FAILED':
      return 'Generator succeeded, but the Reference Solution failed on a generated test.';
    case 'REFERENCE_SOLUTION_TIMEOUT':
      return 'Reference Solution timed out while generating expected output.';
    case 'EXECUTION_WORKER_FAILED':
      return 'Code execution worker failed before producing a sandbox result.';
    case 'EXECUTION_RESULT_INVALID':
      return 'Persisted execution result is malformed or unreadable.';
    default:
      return 'Preview could not be completed.';
  }
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function fingerprintLabel(value: string | null | undefined) {
  return value ? value.slice(0, 12) : 'manual';
}

function parseGenerationInputPayload(raw: string, visibility: 'PUBLIC' | 'HIDDEN') {
  const parsed = JSON.parse(raw) as {
    readonly version?: unknown;
    readonly tests?: readonly unknown[];
  };

  if (parsed.version !== 1) {
    throw new Error(`Unsupported version: ${String(parsed.version ?? 'missing')}.`);
  }
  if (!Array.isArray(parsed.tests)) {
    throw new Error('No tests found.');
  }
  if (parsed.tests.length === 0) {
    throw new Error('No tests found.');
  }

  parsed.tests.forEach((item, index) => {
    if (!item || typeof item !== 'object' || !Object.prototype.hasOwnProperty.call(item, 'input')) {
      throw new Error(`Test #${index + 1} has no input.`);
    }
  });

  return JSON.stringify({
    version: 1,
    visibility,
    tests: parsed.tests,
  });
}

function buildTemplateDownload() {
  return JSON.stringify({
    version: 1,
    tests: [
      {
        input: {},
      },
    ],
  }, null, 2);
}

export default function InstructorPracticeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<AuthoringTab>('problem');
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
  const [manualImportPayload, setManualImportPayload] = useState(defaultManualImportPayload);
  const [testTool, setTestTool] = useState<TestAuthoringTool>('PUBLIC_EXAMPLE');
  const [publicExampleName, setPublicExampleName] = useState('Example 1');
  const [publicExampleInput, setPublicExampleInput] = useState(defaultPublicExampleInput);
  const [publicExampleWeight, setPublicExampleWeight] = useState(10);
  const [publicExamplePreviewKey, setPublicExamplePreviewKey] = useState<string | null>(null);
  const [publicExampleSaved, setPublicExampleSaved] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [importPreviewCount, setImportPreviewCount] = useState<number | null>(null);
  const [inputImportPayload, setInputImportPayload] = useState(defaultImportPayload);
  const [generatorSource, setGeneratorSource] = useState(defaultGeneratorSource);
  const [generationExecutionId, setGenerationExecutionId] = useState<string | null>(null);
  const [generationVisibility, setGenerationVisibility] = useState<'PUBLIC' | 'HIDDEN'>('HIDDEN');
  const [generationSource, setGenerationSource] = useState<GeneratedSource>('IMPORT');
  const [commitMode, setCommitMode] = useState<CommitMode>('APPEND');

  const detail = useQuery({
    queryKey: ['instructor-practice', params.id],
    queryFn: () => requestJson<ProblemResponse>(`/instructor/practice/problems/${params.id}`),
    enabled: Boolean(params.id),
  });

  const generationExecution = useQuery({
    queryKey: ['instructor-practice-generation-execution', generationExecutionId],
    queryFn: () => requestJson<ExecutionResponse>(`/instructor/practice/executions/${generationExecutionId}`),
    enabled: Boolean(generationExecutionId),
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status;
      return status === 'QUEUED' || status === 'RUNNING' ? 1000 : false;
    },
  });

  const problem = detail.data?.problem;
  const execution = generationExecution.data?.execution;
  const generatedPreview = useMemo(
    () => (execution?.result?.stdout ? parseGeneratedTests(execution.result.stdout) : []),
    [execution?.result?.stdout],
  );
  const publicExampleKey = useMemo(
    () => JSON.stringify({
      name: publicExampleName.trim(),
      input: publicExampleInput,
      weight: publicExampleWeight,
      referenceFingerprint: problem?.currentReferenceFingerprint ?? null,
    }),
    [problem?.currentReferenceFingerprint, publicExampleInput, publicExampleName, publicExampleWeight],
  );

  useEffect(() => {
    if (!problem) return;
    setDescription(problem.description);
    setInputFormat(problem.inputFormat);
    setOutputFormat(problem.outputFormat);
    setConstraints(problem.constraints);
    setStarterCode(problem.starterFiles[0]?.content ?? '');
    setReferenceCode(problem.referenceFiles[0]?.content ?? '');
  }, [problem]);

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
      setTestName(`Sample Case ${(problem?.testCases.length ?? 0) + 1}`);
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

  const importManualTests = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/practice/problems/${params.id}/test-cases/import`, {
        method: 'POST',
        body: manualImportPayload,
      }),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to import tests'),
  });

  const previewInputImport = useMutation({
    mutationFn: (input: { readonly payload: string; readonly source: Extract<GeneratedSource, 'EXAMPLE' | 'IMPORT'> }) =>
      requestJson<PracticeTestGenerationPreviewResponse>(`/instructor/practice/problems/${params.id}/test-generation/import-preview`, {
        method: 'POST',
        body: input.payload,
      }),
    onSuccess: (data, variables) => {
      setActionError(null);
      setGenerationExecutionId(data.executionId);
      setGenerationVisibility(data.visibility);
      setGenerationSource(variables.source);
      if (variables.source !== 'EXAMPLE') {
        setActiveTab('preview');
      }
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to queue input preview'),
  });

  const previewGenerator = useMutation({
    mutationFn: () =>
      requestJson<PracticeTestGenerationPreviewResponse>(`/instructor/practice/problems/${params.id}/test-generation/generator-preview`, {
        method: 'POST',
        body: JSON.stringify({ generatorSource, visibility: generationVisibility }),
      }),
    onSuccess: (data) => {
      setActionError(null);
      setGenerationExecutionId(data.executionId);
      setGenerationVisibility(data.visibility);
      setGenerationSource(data.source);
      setActiveTab('preview');
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to queue generator preview'),
  });

  const commitGeneratedTests = useMutation({
    mutationFn: () =>
      requestJson<PracticeGeneratedTestsCommitResponse>(`/instructor/practice/problems/${params.id}/test-generation/commit`, {
        method: 'POST',
        body: JSON.stringify({
          executionId: generationExecutionId,
          mode: commitMode,
          visibility: generationVisibility,
          source: generationSource,
        }),
      }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
      if (generationSource === 'EXAMPLE') {
        setPublicExampleName(`Example ${publicTests.length + 2}`);
        setPublicExampleInput(defaultPublicExampleInput);
        setPublicExampleWeight(10);
        setPublicExamplePreviewKey(null);
        setPublicExampleSaved(true);
        setGenerationExecutionId(null);
      }
      setActiveTab('tests');
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to commit generated tests'),
  });

  const deleteHiddenTestCase = useMutation({
    mutationFn: (testCaseId: string) =>
      requestJson<void>(`/instructor/practice/test-cases/${testCaseId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to delete hidden test'),
  });

  const deleteHiddenTests = useMutation({
    mutationFn: (input: { readonly source?: Extract<GeneratedSource, 'IMPORT' | 'GENERATOR'> }) =>
      requestJson<PracticeHiddenTestsDeleteResponse>(
        input.source
          ? `/instructor/practice/problems/${params.id}/test-cases/hidden/source/${input.source}`
          : `/instructor/practice/problems/${params.id}/test-cases/hidden`,
        { method: 'DELETE' },
      ),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to delete hidden tests'),
  });

  const archive = useMutation({
    mutationFn: () => requestJson(`/instructor/practice/problems/${params.id}/archive`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Failed to archive problem'),
  });

  const queuePublicExamplePreview = () => {
    try {
      const parsedInput = JSON.parse(publicExampleInput) as unknown;
      setPublicExampleSaved(false);
      setPublicExamplePreviewKey(publicExampleKey);
      previewInputImport.mutate({
        source: 'EXAMPLE',
        payload: JSON.stringify({
          version: 1,
          visibility: 'PUBLIC',
          tests: [{
            name: publicExampleName,
            input: parsedInput,
            weight: publicExampleWeight,
          }],
        }),
      });
    } catch {
      setActionError('Public example input must be valid JSON.');
    }
  };

  const queueHiddenImportPreview = () => {
    try {
      const payload = parseGenerationInputPayload(inputImportPayload, 'HIDDEN');
      previewInputImport.mutate({ source: 'IMPORT', payload });
    } catch (err: unknown) {
      setImportFileError(err instanceof Error ? err.message : 'Invalid JSON file.');
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    setImportFileError(null);
    setImportPreviewCount(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      setImportFileError('Please select a .json file.');
      return;
    }
    if (file.size > 256 * 1024) {
      setImportFileError('JSON file must be 256 KB or smaller.');
      return;
    }

    try {
      const text = await file.text();
      const payload = parseGenerationInputPayload(text, 'HIDDEN');
      const parsed = JSON.parse(payload) as { readonly tests: readonly unknown[] };
      setImportFileName(file.name);
      setImportPreviewCount(parsed.tests.length);
      setInputImportPayload(payload);
    } catch (err: unknown) {
      setImportFileError(err instanceof Error ? err.message : 'Invalid JSON file.');
    }
  };

  const downloadJsonTemplate = () => {
    const blob = new Blob([buildTemplateDownload()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'codesync-practice-hidden-inputs-template.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <LoadingState title="Loading Practice Problem" message="Fetching problem details and automated test cases..." />
      </div>
    );
  }

  if (detail.isError || !problem) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
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

  const currentReferenceFingerprint = problem.currentReferenceFingerprint;
  const generatedCount = problem.testCases.filter((test) => test.expectedOutputSource === 'REFERENCE_SOLUTION').length;
  const publicTests = problem.testCases.filter((test) => test.visibility === 'PUBLIC');
  const hiddenTests = problem.testCases.filter((test) => test.visibility === 'HIDDEN');
  const hiddenImportTests = hiddenTests.filter((test) => test.source === 'IMPORT');
  const hiddenGeneratorTests = hiddenTests.filter((test) => test.source === 'GENERATOR');
  const staleTests = problem.testCases.filter((test) =>
    test.expectedOutputSource === 'REFERENCE_SOLUTION' &&
    currentReferenceFingerprint &&
    test.referenceFingerprint &&
    test.referenceFingerprint !== currentReferenceFingerprint);
  const hasGeneratedOutputs = generatedCount > 0;
  const expectedOutputsCurrent = hasGeneratedOutputs && staleTests.length === 0;
  const publicExamplePreviewIsCurrent =
    generationSource === 'EXAMPLE' &&
    Boolean(generationExecutionId) &&
    publicExamplePreviewKey === publicExampleKey;
  const publicExamplePreview = publicExamplePreviewIsCurrent ? generatedPreview[0] : undefined;
  const publicExamplePreviewStatus = publicExamplePreviewIsCurrent ? execution?.status : null;
  const publicExamplePreviewError = publicExamplePreviewIsCurrent ? execution?.result?.stderr : null;
  const canSavePublicExample =
    publicExamplePreviewIsCurrent &&
    publicExamplePreviewStatus === 'SUCCEEDED' &&
    Boolean(publicExamplePreview) &&
    !commitGeneratedTests.isPending;
  const hiddenDeletePending = deleteHiddenTestCase.isPending || deleteHiddenTests.isPending;
  const confirmDeleteHiddenTest = (test: InstructorPracticeProblem['testCases'][number]) => {
    const confirmed = window.confirm(`Delete hidden test "${test.name}"? This will mark the problem as not validated.`);
    if (confirmed) {
      deleteHiddenTestCase.mutate(test.id);
    }
  };
  const confirmDeleteHiddenTests = (input: {
    readonly source?: Extract<GeneratedSource, 'IMPORT' | 'GENERATOR'>;
    readonly count: number;
    readonly label: string;
  }) => {
    const confirmed = window.confirm(`Delete ${input.count} ${input.label}? This will mark the problem as not validated.`);
    if (confirmed) {
      deleteHiddenTests.mutate(input.source ? { source: input.source } : {});
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/instructor/practice"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
            <div className="flex flex-wrap items-center gap-3">
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
        <div className="flex items-start gap-3 whitespace-pre-line rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Difficulty</div>
            <StatusBadge tone={difficultyToneMap[problem.difficulty as keyof typeof difficultyToneMap] ?? 'neutral'}>
              {problem.difficulty}
            </StatusBadge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Test cases</div>
            <div className="text-lg font-semibold">{problem.testCases.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Reference-generated</div>
            <div className="text-lg font-semibold">{generatedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Validation</div>
            <div className="truncate text-sm font-medium">
              {problem.validatedAt ? new Date(problem.validatedAt).toLocaleString() : 'Not validated'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs<AuthoringTab>
        activeTab={activeTab}
        onTabChange={setActiveTab}
        items={[
          { id: 'problem', label: 'Problem', icon: <FileCode className="h-4 w-4" /> },
          { id: 'code', label: 'Code', icon: <Sparkles className="h-4 w-4" /> },
          { id: 'tests', label: 'Tests', icon: <FlaskConical className="h-4 w-4" />, badge: <Badge variant="outline">{problem.testCases.length}</Badge> },
          { id: 'preview', label: 'Preview', icon: <Play className="h-4 w-4" /> },
        ]}
      />

      {activeTab === 'problem' ? (
        <Card>
          <CardHeader>
            <CardTitle>Problem Statement</CardTitle>
            <CardDescription>Define the student-facing contract. The backend remains the source of truth for validation and publishing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {problem.status === 'DRAFT' ? (
              <>
                <Textarea className="min-h-44 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} />
                <div className="grid gap-4 lg:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Input Format</label>
                    <Textarea className="min-h-28 text-sm" value={inputFormat} onChange={(event) => setInputFormat(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Output Format</label>
                    <Textarea className="min-h-28 text-sm" value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Constraints</label>
                    <Textarea className="min-h-28 text-sm" value={constraints} onChange={(event) => setConstraints(event.target.value)} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  isLoading={updateProblem.isPending}
                  onClick={() => updateProblem.mutate()}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Save Problem
                </Button>
              </>
            ) : (
              <div className="grid gap-4 text-sm lg:grid-cols-2">
                <pre className="min-h-36 whitespace-pre-wrap rounded-lg bg-muted/40 p-4 font-sans">{problem.description}</pre>
                <div className="space-y-3">
                  <div className="rounded-lg bg-muted/40 p-3"><strong>Input:</strong> {problem.inputFormat}</div>
                  <div className="rounded-lg bg-muted/40 p-3"><strong>Output:</strong> {problem.outputFormat}</div>
                  <div className="rounded-lg bg-muted/40 p-3"><strong>Constraints:</strong> {problem.constraints}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'code' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Starter Code</CardTitle>
              <CardDescription>Student workspaces are created from this template.</CardDescription>
            </CardHeader>
            <CardContent>
              {problem.status === 'DRAFT' ? (
                <Textarea className="min-h-[440px] font-mono text-xs" value={starterCode} onChange={(event) => setStarterCode(event.target.value)} />
              ) : (
                <pre className="min-h-[440px] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs">{problem.starterFiles[0]?.content}</pre>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reference Solution</CardTitle>
              <CardDescription>Expected outputs can be generated from this oracle inside the code execution sandbox.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {problem.status === 'DRAFT' ? (
                <>
                  <Textarea className="min-h-[440px] font-mono text-xs" value={referenceCode} onChange={(event) => setReferenceCode(event.target.value)} />
                  <Button
                    type="button"
                    isLoading={updateProblem.isPending}
                    onClick={() => updateProblem.mutate()}
                    leftIcon={<Save className="h-4 w-4" />}
                  >
                    Save Code
                  </Button>
                </>
              ) : (
                <pre className="min-h-[440px] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs">{problem.referenceFiles[0]?.content}</pre>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'tests' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Test Suite Manager</CardTitle>
                  <CardDescription>
                    Build examples and hidden tests from inputs. Expected outputs are normally generated from the reference solution.
                  </CardDescription>
                </div>
                <Badge variant="outline">Reference {fingerprintLabel(currentReferenceFingerprint)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Public Examples</div>
                  <div className="text-2xl font-semibold">{publicTests.length}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Hidden Tests</div>
                  <div className="text-2xl font-semibold">{hiddenTests.length}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-2xl font-semibold">{problem.testCases.length}</div>
                </div>
              </div>

              {problem.status === 'DRAFT' ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant={testTool === 'PUBLIC_EXAMPLE' ? 'primary' : 'outline'} onClick={() => setTestTool('PUBLIC_EXAMPLE')} leftIcon={<Plus className="h-4 w-4" />}>
                    Add Public Example
                  </Button>
                  <Button type="button" variant={testTool === 'IMPORT_HIDDEN' ? 'primary' : 'outline'} onClick={() => setTestTool('IMPORT_HIDDEN')} leftIcon={<Upload className="h-4 w-4" />}>
                    Import Hidden Inputs
                  </Button>
                  <Button type="button" variant={testTool === 'GENERATOR' ? 'primary' : 'outline'} onClick={() => setTestTool('GENERATOR')} leftIcon={<Sparkles className="h-4 w-4" />}>
                    Generator Script
                  </Button>
                  <Button type="button" variant={testTool === 'ADVANCED' ? 'secondary' : 'ghost'} onClick={() => setTestTool('ADVANCED')} rightIcon={<ChevronDown className="h-4 w-4" />}>
                    Advanced
                  </Button>
                </div>
              ) : null}

              {problem.testCases.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                  <h3 className="text-lg font-semibold">No tests yet</h3>
                  <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                    Start by adding a public example, importing hidden inputs from a JSON file, or running a generator script.
                  </p>
                  {problem.status === 'DRAFT' ? (
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <Button type="button" variant="outline" onClick={() => setTestTool('PUBLIC_EXAMPLE')} leftIcon={<Plus className="h-4 w-4" />}>Add Public Example</Button>
                      <Button type="button" variant="outline" onClick={() => setTestTool('IMPORT_HIDDEN')} leftIcon={<Upload className="h-4 w-4" />}>Import Hidden Inputs</Button>
                      <Button type="button" variant="outline" onClick={() => setTestTool('GENERATOR')} leftIcon={<Sparkles className="h-4 w-4" />}>Generator Script</Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-6">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold tracking-wide">PUBLIC EXAMPLES</h3>
                      <Badge variant="outline">{publicTests.length}</Badge>
                    </div>
                    {publicTests.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No public examples yet.</div>
                    ) : publicTests.map((test, index) => (
                      <div key={test.id} className="rounded-lg border bg-card p-4 transition-all hover:border-primary/40">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {index + 1}
                          </span>
                          <span className="text-sm font-semibold text-foreground">{test.name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default" className="text-xs"><span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Public</span></Badge>
                          <Badge tone={test.source === 'EXAMPLE' ? 'success' : 'neutral'}>{test.source ?? 'MANUAL'}</Badge>
                          <Badge tone={test.expectedOutputSource === 'REFERENCE_SOLUTION' ? 'success' : 'neutral'}>
                            {test.expectedOutputSource === 'REFERENCE_SOLUTION' ? 'Reference output' : 'Manual output'}
                          </Badge>
                          <span className="text-xs font-medium text-muted-foreground">Weight: {test.weight}</span>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                        <div>
                          <span className="font-medium text-muted-foreground">Input</span>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-foreground">{test.input || '<empty>'}</pre>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Expected Output</span>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-foreground">{test.expectedOutput || '<empty>'}</pre>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>Fingerprint: {fingerprintLabel(test.referenceFingerprint)}</span>
                      </div>
                    </div>
                    ))}
                  </section>

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold tracking-wide">HIDDEN TESTS</h3>
                        <Badge variant="outline">{hiddenTests.length}</Badge>
                      </div>
                      {problem.status === 'DRAFT' && hiddenTests.length > 0 ? (
                        <Dropdown
                          align="right"
                          trigger={(
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={hiddenDeletePending}
                              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            >
                              Hidden Actions
                            </Button>
                          )}
                          items={[
                            ...(hiddenImportTests.length > 0 ? [{
                              label: `Delete IMPORT hidden tests (${hiddenImportTests.length})`,
                              icon: <Trash2 className="h-3.5 w-3.5" />,
                              variant: 'danger' as const,
                              disabled: hiddenDeletePending,
                              onClick: () => confirmDeleteHiddenTests({
                                source: 'IMPORT',
                                count: hiddenImportTests.length,
                                label: 'IMPORT hidden tests',
                              }),
                            }] : []),
                            ...(hiddenGeneratorTests.length > 0 ? [{
                              label: `Delete GENERATOR hidden tests (${hiddenGeneratorTests.length})`,
                              icon: <Trash2 className="h-3.5 w-3.5" />,
                              variant: 'danger' as const,
                              disabled: hiddenDeletePending,
                              onClick: () => confirmDeleteHiddenTests({
                                source: 'GENERATOR',
                                count: hiddenGeneratorTests.length,
                                label: 'GENERATOR hidden tests',
                              }),
                            }] : []),
                            {
                              label: `Delete all hidden tests (${hiddenTests.length})`,
                              icon: <Trash2 className="h-3.5 w-3.5" />,
                              variant: 'danger' as const,
                              disabled: hiddenDeletePending,
                              onClick: () => confirmDeleteHiddenTests({
                                count: hiddenTests.length,
                                label: 'hidden tests',
                              }),
                            },
                          ]}
                        />
                      ) : null}
                    </div>
                    {hiddenTests.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No hidden tests yet.</div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {hiddenTests.map((test, index) => (
                          <details key={test.id} className="rounded-lg border bg-card p-3 text-sm">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                              <span className="font-medium">#{index + 1} {test.name}</span>
                              <span className="flex items-center gap-2">
                                <Badge tone={test.referenceFingerprint && currentReferenceFingerprint && test.referenceFingerprint !== currentReferenceFingerprint ? 'warning' : 'success'}>
                                  {test.referenceFingerprint && currentReferenceFingerprint && test.referenceFingerprint !== currentReferenceFingerprint ? 'STALE' : 'Ready'}
                                </Badge>
                                <Badge tone={test.source === 'GENERATOR' ? 'info' : test.source === 'IMPORT' ? 'success' : 'neutral'}>{test.source ?? 'MANUAL'}</Badge>
                                {problem.status === 'DRAFT' ? (
                                  <Dropdown
                                    align="right"
                                    trigger={(
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 px-0"
                                        aria-label={`Actions for ${test.name}`}
                                        disabled={hiddenDeletePending}
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    )}
                                    items={[{
                                      label: 'Delete hidden test',
                                      icon: <Trash2 className="h-3.5 w-3.5" />,
                                      variant: 'danger',
                                      disabled: hiddenDeletePending,
                                      onClick: () => confirmDeleteHiddenTest(test),
                                    }]}
                                  />
                                ) : null}
                              </span>
                            </summary>
                            <div className="mt-3 grid gap-3 text-xs">
                              <div>
                                <span className="font-medium text-muted-foreground">Input</span>
                                <pre className="mt-1 max-h-28 overflow-auto rounded bg-muted p-2 font-mono">{test.input}</pre>
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Expected</span>
                                <pre className="mt-1 max-h-28 overflow-auto rounded bg-muted p-2 font-mono">{test.expectedOutput}</pre>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Validation</h3>
                  <StatusBadge tone={problem.validatedAt && expectedOutputsCurrent ? 'success' : staleTests.length > 0 ? 'warning' : 'neutral'}>
                    {problem.validatedAt && expectedOutputsCurrent ? 'READY TO PUBLISH' : staleTests.length > 0 ? 'NEEDS REGENERATION' : 'NOT VALIDATED'}
                  </StatusBadge>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <span className={problem.referenceFiles.length > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>✓ Reference Solution {problem.referenceFiles.length > 0 ? 'configured' : 'missing'}</span>
                  <span className={publicTests.length > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
                    {publicTests.length > 0 ? `✓ ${publicTests.length} public examples ready` : '— No public examples yet'}
                  </span>
                  <span className={hiddenTests.length > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
                    {hiddenTests.length > 0 ? `✓ ${hiddenTests.length} hidden tests ready` : '— No hidden tests yet'}
                  </span>
                  <span className={staleTests.length > 0 ? 'text-amber-700 dark:text-amber-400' : expectedOutputsCurrent ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
                    {staleTests.length > 0
                      ? `⚠ ${staleTests.length} expected outputs are stale`
                      : expectedOutputsCurrent
                        ? '✓ Expected outputs current'
                        : '— No expected outputs generated yet'}
                  </span>
                </div>
                {staleTests.length > 0 ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Regenerate expected outputs by importing the hidden input JSON again or rerunning the generator script, then validate.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {problem.status === 'DRAFT' ? (
            <div className="space-y-6">
              {testTool === 'PUBLIC_EXAMPLE' ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Add Public Example</CardTitle>
                    <CardDescription>Enter the test input only. CodeSync runs the Reference Solution to generate the expected output.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-foreground">Example Name</label>
                      <Input
                        value={publicExampleName}
                        onChange={(event) => {
                          setPublicExampleName(event.target.value);
                          setPublicExampleSaved(false);
                        }}
                        placeholder="Example 1"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-foreground">Points</label>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={publicExampleWeight}
                        onChange={(event) => {
                          setPublicExampleWeight(Number(event.target.value));
                          setPublicExampleSaved(false);
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-foreground">Input JSON</label>
                      <Textarea
                        className="min-h-40 font-mono text-xs"
                        value={publicExampleInput}
                        onChange={(event) => {
                          setPublicExampleInput(event.target.value);
                          setPublicExampleSaved(false);
                        }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        isLoading={previewInputImport.isPending && generationSource === 'EXAMPLE'}
                        disabled={publicExamplePreviewStatus === 'QUEUED' || publicExamplePreviewStatus === 'RUNNING'}
                        onClick={queuePublicExamplePreview}
                        leftIcon={<Play className="h-4 w-4" />}
                      >
                        Preview Expected Output
                      </Button>
                      {publicExampleSaved ? <Badge tone="success">Saved</Badge> : null}
                    </div>

                    {publicExamplePreviewStatus === 'QUEUED' || publicExamplePreviewStatus === 'RUNNING' ? (
                      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                        Generating expected output...
                      </div>
                    ) : null}

                    {publicExamplePreviewError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        <div className="font-semibold">Reference solution failed for this input.</div>
                        <pre className="mt-2 max-h-40 overflow-auto font-mono text-xs">{publicExamplePreviewError}</pre>
                      </div>
                    ) : null}

                    {publicExamplePreviewStatus === 'SUCCEEDED' && publicExamplePreview ? (
                      <div className="space-y-3 rounded-lg border bg-card p-4">
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted-foreground">Expected Output</div>
                          <pre className="max-h-40 overflow-auto rounded bg-muted p-3 font-mono text-xs">{publicExamplePreview.expectedOutput}</pre>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge tone="success">Generated from Reference Solution</Badge>
                          <span>Status: Ready to save</span>
                        </div>
                        <Button
                          type="button"
                          isLoading={commitGeneratedTests.isPending}
                          disabled={!canSavePublicExample}
                          onClick={() => commitGeneratedTests.mutate()}
                          leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        >
                          Save Public Example
                        </Button>
                      </div>
                    ) : publicExamplePreviewKey && !publicExamplePreviewIsCurrent ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                        The example changed after preview. Preview Expected Output again before saving.
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                        Preview does not save anything. After the expected output is generated, use Save Public Example.
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {testTool === 'IMPORT_HIDDEN' ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Import Hidden Inputs</CardTitle>
                        <CardDescription>Select a .json file with inputs only. The database is not changed until you confirm the preview.</CardDescription>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={downloadJsonTemplate} leftIcon={<Download className="h-4 w-4" />}>
                        Download JSON Template
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center transition-colors hover:bg-muted/40">
                      <Upload className="mb-3 h-6 w-6 text-muted-foreground" />
                      <span className="text-sm font-medium">{importFileName ?? 'Choose hidden-inputs.json'}</span>
                      <span className="mt-1 text-xs text-muted-foreground">Accepted: .json, max 256 KB</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        className="sr-only"
                        onChange={(event) => {
                          void handleImportFile(event.target.files?.[0]);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {importFileError ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{importFileError}</div> : null}
                    {importPreviewCount !== null ? (
                      <div className="rounded-lg border bg-card p-3 text-sm">
                        <strong>{importPreviewCount} tests found.</strong> Ready to send to the reference oracle for expected outputs.
                      </div>
                    ) : null}
                    <Button type="button" isLoading={previewInputImport.isPending} disabled={!importFileName || Boolean(importFileError)} onClick={queueHiddenImportPreview} leftIcon={<Play className="h-4 w-4" />}>
                      Preview Hidden Tests
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {testTool === 'GENERATOR' ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Generator Script</CardTitle>
                    <CardDescription>Export generateTests(). It should return JSON-serializable inputs; expected outputs are still generated from the reference solution.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea className="min-h-72 font-mono text-xs" value={generatorSource} onChange={(event) => setGeneratorSource(event.target.value)} />
                    <pre className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{'function generateTests() {\\n  return [\\n    { value: 1 },\\n    { value: 2 }\\n  ];\\n}\\n\\nmodule.exports = { generateTests };'}</pre>
                    <Button
                      type="button"
                      isLoading={previewGenerator.isPending}
                      onClick={() => previewGenerator.mutate()}
                      leftIcon={<Sparkles className="h-4 w-4" />}
                    >
                      Run Generator Preview
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {testTool === 'ADVANCED' ? (
                <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Plus className="h-5 w-5 text-primary" />
                    <CardTitle>Advanced: Add Manual Test</CardTitle>
                  </div>
                  <CardDescription>Manual expected output mode. Use only when reference-generated output is not appropriate.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      addTest.mutate();
                    }}
                    className="space-y-4"
                  >
                    <Input required placeholder="Test case name" value={testName} onChange={(event) => setTestName(event.target.value)} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select
                        value={visibility}
                        onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'HIDDEN')}
                        options={[
                          { label: 'Public', value: 'PUBLIC' },
                          { label: 'Hidden', value: 'HIDDEN' },
                        ]}
                      />
                      <Input type="number" min={1} max={1000} value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
                    </div>
                    <Textarea className="min-h-24 font-mono text-xs" placeholder="Structured input JSON" value={input} onChange={(event) => setInput(event.target.value)} />
                    <Textarea required className="min-h-24 font-mono text-xs" placeholder="Expected output JSON" value={expectedOutput} onChange={(event) => setExpectedOutput(event.target.value)} />
                    <Button type="submit" isLoading={addTest.isPending} leftIcon={<Plus className="h-4 w-4" />}>
                      Save Manual Test
                    </Button>
                  </form>
                </CardContent>
              </Card>
              ) : null}

              {testTool === 'ADVANCED' ? (
                <Card>
                <CardHeader>
                  <CardTitle>Advanced: Legacy Manual Import</CardTitle>
                  <CardDescription>Imports fully-specified tests with expected outputs. Use Preview for reference-generated outputs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea className="min-h-36 font-mono text-xs" value={manualImportPayload} onChange={(event) => setManualImportPayload(event.target.value)} />
                  <Button type="button" variant="outline" isLoading={importManualTests.isPending} onClick={() => importManualTests.mutate()}>
                    Import Manual Tests
                  </Button>
                </CardContent>
              </Card>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'preview' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Generated Output Preview</CardTitle>
                <CardDescription>
                  Inputs are executed against the reference solution in the existing code execution worker. Expected outputs are read-only here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!generationExecutionId ? (
                  <EmptyState title="No Preview Running" message="Queue an input import or generator preview to calculate expected outputs." />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Execution {generationExecutionId}</Badge>
                      <Badge tone={generationSource === 'EXAMPLE' ? 'success' : generationSource === 'GENERATOR' ? 'info' : 'neutral'}>
                        {generationSource === 'EXAMPLE' ? 'Public Example' : generationSource === 'GENERATOR' ? 'Generator Script' : 'Hidden Import'}
                      </Badge>
                      <StatusBadge tone={execution?.status === 'SUCCEEDED' ? 'success' : execution?.status === 'FAILED' || execution?.status === 'TIMED_OUT' ? 'danger' : 'warning'}>
                        {execution?.status ?? 'QUEUED'}
                      </StatusBadge>
                    </div>
                    {execution?.result && (execution.status === 'FAILED' || execution.status === 'TIMED_OUT') ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                        <div className="mb-2 text-sm font-semibold">
                          {generationErrorTitle(execution.result.errorCode, generationSource)}
                        </div>
                        <pre className="max-h-48 overflow-auto font-mono text-xs">
                          {generationErrorMessage(execution.result.errorCode, execution.result.stderr)}
                        </pre>
                      </div>
                    ) : null}
                    {generatedPreview.length > 0 ? (
                      <div className="space-y-3">
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                          <strong>{generatedPreview.length} tests ready.</strong> Expected outputs were generated from the current Reference Solution.
                        </div>
                        {generatedPreview.map((test, index) => (
                          <div key={`${test.name}-${index}`} className="rounded-lg border bg-card p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold">{test.name}</span>
                              <Badge variant="outline">Weight {test.weight}</Badge>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="mb-1 text-xs font-medium text-muted-foreground">Input</div>
                                <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs">{prettyJson(test.input)}</pre>
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-medium text-muted-foreground">Expected Output · Generated from Reference Solution</div>
                                <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs">{test.expectedOutput}</pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : execution?.status === 'SUCCEEDED' ? (
                      <EmptyState title="No Tests Returned" message="The generation execution succeeded but returned no tests." />
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{generationSource === 'EXAMPLE' ? 'Save Public Example' : generationSource === 'GENERATOR' ? 'Commit Generator Preview' : 'Import Preview'}</CardTitle>
                <CardDescription>
                  {generationSource === 'EXAMPLE'
                    ? 'This will save the preview as a public example.'
                    : generationSource === 'GENERATOR'
                      ? 'This will save generated inputs and reference outputs as hidden tests by default.'
                      : 'This will import hidden tests from the selected JSON inputs.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select
                  value={generationVisibility}
                  disabled={generationSource === 'EXAMPLE'}
                  onChange={(event) => setGenerationVisibility(event.target.value as 'PUBLIC' | 'HIDDEN')}
                  options={[
                    { label: 'Public examples', value: 'PUBLIC' },
                    { label: 'Hidden tests', value: 'HIDDEN' },
                  ]}
                />
                <Select
                  value={commitMode}
                  disabled={generationSource === 'EXAMPLE'}
                  onChange={(event) => setCommitMode(event.target.value as CommitMode)}
                  options={[
                    { label: 'Append to suite', value: 'APPEND' },
                    { label: 'Replace hidden tests', value: 'REPLACE_HIDDEN' },
                  ]}
                />
                <Button
                  type="button"
                  disabled={!generationExecutionId || execution?.status !== 'SUCCEEDED' || generatedPreview.length === 0}
                  isLoading={commitGeneratedTests.isPending}
                  onClick={() => commitGeneratedTests.mutate()}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                >
                  {generationSource === 'EXAMPLE'
                    ? 'Save Public Example'
                    : generationSource === 'GENERATOR'
                      ? `Commit ${generatedPreview.length || ''} Generated Tests`
                      : `Import ${generatedPreview.length || ''} Hidden Tests`}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Start Another Preview</CardTitle>
                <CardDescription>Use the Tests tab primary actions for file import, public examples, or generator scripts.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" variant="outline" onClick={() => setActiveTab('tests')}>
                  Back to Test Suite Manager
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
