import type { JudgeSubmissionStatus, ScoringMode, TestCaseResultStatus, TestCaseVisibility } from '@prisma/client';

export interface PublicTestCaseResponse {
  readonly id: string;
  readonly name: string;
  readonly input: string;
  readonly expectedOutput: string;
  readonly weight: number;
  readonly position: number;
}

export interface InstructorTestCaseResponse {
  readonly id: string;
  readonly name: string;
  readonly visibility: TestCaseVisibility;
  readonly input: string;
  readonly expectedOutput: string;
  readonly weight: number;
  readonly position: number;
}

export interface CodingConfigResponse {
  readonly id: string;
  readonly checkpointId: string;
  readonly language: string;
  readonly entryFile: string;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly passScore: number;
  readonly scoringMode: ScoringMode;
  readonly starterFiles: readonly { readonly path: string; readonly content: string }[];
  readonly publicTests: readonly PublicTestCaseResponse[];
  readonly hiddenTestCount: number;
}

export interface JudgeSubmissionQueuedResponse {
  readonly id: string;
  readonly status: JudgeSubmissionStatus;
}

export interface SafeTestCaseResultResponse {
  readonly id: string;
  readonly testCaseId: string | null;
  readonly name: string;
  readonly visibility: TestCaseVisibility;
  readonly status: TestCaseResultStatus;
  readonly scoreEarned: number;
  readonly actualOutput: string | null;
  readonly stderr: string | null;
  readonly durationMs: number;
  readonly memoryBytes: string | null;
}

export interface JudgeSubmissionDetailResponse {
  readonly id: string;
  readonly workspaceId: string;
  readonly checkpointId: string | null;
  readonly practiceProblemId: string | null;
  readonly status: JudgeSubmissionStatus;
  readonly score: number | null;
  readonly passed: boolean | null;
  readonly submittedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly failedAt: string | null;
  readonly result: {
    readonly totalScore: number;
    readonly maxScore: number;
    readonly passed: boolean;
    readonly totalTests: number;
    readonly passedTests: number;
    readonly durationMs: number;
    readonly peakMemoryBytes: string | null;
    readonly testResults: readonly SafeTestCaseResultResponse[];
  } | null;
}

export interface JudgeSubmissionHistoryItem {
  readonly id: string;
  readonly status: JudgeSubmissionStatus;
  readonly score: number | null;
  readonly passed: boolean | null;
  readonly submittedAt: string;
  readonly durationMs: number | null;
}
