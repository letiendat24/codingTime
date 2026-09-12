export type AsyncMessagePayload = Record<string, unknown>;

export interface AsyncMessage<TPayload extends AsyncMessagePayload> {
  readonly jobId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly requestedByUserId: string;
  readonly createdAt: string;
  readonly payload: TPayload;
}

export interface VideoProcessingRequestedPayload extends AsyncMessagePayload {
  readonly videoAssetId: string;
  readonly sourceObjectKey: string;
}

export interface VideoProcessingStartedPayload extends AsyncMessagePayload {
  readonly videoAssetId: string;
}

export interface VideoProcessingProgressPayload extends AsyncMessagePayload {
  readonly videoAssetId: string;
  readonly progressPercent: number;
}

export interface VideoProcessingRenditionPayload {
  readonly quality: '360P' | '480P' | '720P' | '1080P';
  readonly width: number;
  readonly height: number;
  readonly bitrate: number;
  readonly playlistObjectKey: string;
}

export interface VideoProcessingCompletedPayload extends AsyncMessagePayload {
  readonly videoAssetId: string;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly masterPlaylistObjectKey: string;
  readonly thumbnailObjectKey: string;
  readonly renditions: readonly VideoProcessingRenditionPayload[];
}

export interface VideoProcessingFailedPayload extends AsyncMessagePayload {
  readonly videoAssetId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly retryable: boolean;
}

export const VIDEO_EXCHANGE = 'video.events';
export const VIDEO_PROCESSING_QUEUE = 'video.processing.requests';
export const VIDEO_PROCESSING_DLQ = 'video.processing.requests.dlq';
export const VIDEO_RESULT_QUEUE = 'video.processing.results';

export const VIDEO_ROUTING_KEYS = {
  requested: 'video.processing.requested',
  started: 'video.processing.started',
  progress: 'video.processing.progress',
  completed: 'video.processing.completed',
  failed: 'video.processing.failed',
} as const;

export interface CodeExecutionFile {
  readonly path: string;
  readonly content: string;
}

export interface CodeExecutionRequestedPayload extends AsyncMessagePayload {
  readonly executionId: string;
  readonly workspaceId: string;
  readonly language: string;
  readonly files: readonly CodeExecutionFile[];
  readonly entryFile: string;
}

export interface CodeExecutionStartedPayload extends AsyncMessagePayload {
  readonly executionId: string;
}

export interface CodeExecutionCompletedPayload extends AsyncMessagePayload {
  readonly executionId: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly memoryBytes: number | null;
}

export interface CodeExecutionFailedPayload extends AsyncMessagePayload {
  readonly executionId: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly memoryBytes: number | null;
  readonly errorCode: string;
  readonly retryable: boolean;
}

export interface CodeExecutionTimedOutPayload extends AsyncMessagePayload {
  readonly executionId: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly errorCode: string;
}

export const CODE_EXCHANGE = 'code.events';
export const CODE_EXECUTION_QUEUE = 'code.execution.requests';
export const CODE_EXECUTION_DLQ = 'code.execution.requests.dlq';
export const CODE_EXECUTION_RESULT_QUEUE = 'code.execution.results';

export const CODE_EXECUTION_ROUTING_KEYS = {
  requested: 'code.execution.requested',
  started: 'code.execution.started',
  completed: 'code.execution.completed',
  failed: 'code.execution.failed',
  timedOut: 'code.execution.timed_out',
} as const;

export interface CodeJudgeTestCasePayload {
  readonly id: string;
  readonly name: string;
  readonly visibility: 'PUBLIC' | 'HIDDEN';
  readonly input: string;
  readonly expectedOutput: string;
  readonly weight: number;
  readonly position: number;
}

export interface CodeJudgeRequestedPayload extends AsyncMessagePayload {
  readonly submissionId: string;
  readonly checkpointId: string | null;
  readonly practiceProblemId: string | null;
  readonly language: string;
  readonly entryFile: string;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly passScore: number;
  readonly scoringMode: 'ALL_OR_NOTHING' | 'WEIGHTED';
  readonly files: readonly CodeExecutionFile[];
  readonly testCases: readonly CodeJudgeTestCasePayload[];
}

export interface CodeJudgeStartedPayload extends AsyncMessagePayload {
  readonly submissionId: string;
}

export interface CodeJudgeTestCaseResultPayload {
  readonly testCaseId: string;
  readonly name: string;
  readonly visibility: 'PUBLIC' | 'HIDDEN';
  readonly status:
    | 'PASSED'
    | 'WRONG_ANSWER'
    | 'RUNTIME_ERROR'
    | 'TIME_LIMIT_EXCEEDED'
    | 'MEMORY_LIMIT_EXCEEDED'
    | 'INTERNAL_ERROR';
  readonly scoreEarned: number;
  readonly actualOutput: string | null;
  readonly stderr: string | null;
  readonly durationMs: number;
  readonly memoryBytes: number | null;
}

export interface CodeJudgeCompletedPayload extends AsyncMessagePayload {
  readonly submissionId: string;
  readonly totalScore: number;
  readonly maxScore: number;
  readonly passed: boolean;
  readonly totalTests: number;
  readonly passedTests: number;
  readonly durationMs: number;
  readonly peakMemoryBytes: number | null;
  readonly testResults: readonly CodeJudgeTestCaseResultPayload[];
}

export interface CodeJudgeFailedPayload extends AsyncMessagePayload {
  readonly submissionId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly retryable: boolean;
}

export interface CodeJudgeTimedOutPayload extends AsyncMessagePayload {
  readonly submissionId: string;
  readonly durationMs: number;
  readonly errorCode: string;
  readonly testResults: readonly CodeJudgeTestCaseResultPayload[];
}

export const CODE_JUDGE_QUEUE = 'code.judge.requests';
export const CODE_JUDGE_DLQ = 'code.judge.requests.dlq';
export const CODE_JUDGE_RESULT_QUEUE = 'code.judge.results';

export const CODE_JUDGE_ROUTING_KEYS = {
  requested: 'code.judge.requested',
  started: 'code.judge.started',
  completed: 'code.judge.completed',
  failed: 'code.judge.failed',
  timedOut: 'code.judge.timed_out',
} as const;

export type ProjectCriterionTypePayload = 'AUTO' | 'MANUAL';
export type ProjectAutoCheckTypePayload = 'FILE_EXISTS' | 'JSON_FIELD' | 'BUILD_SUCCESS' | 'TEST_SUCCESS' | 'DEPLOYMENT_HEALTH';
export type ProjectRubricResultStatusPayload = 'PASSED' | 'FAILED' | 'PENDING_MANUAL' | 'ERROR';

export interface ProjectRubricCriterionPayload {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly type: ProjectCriterionTypePayload;
  readonly autoCheckType: ProjectAutoCheckTypePayload | null;
  readonly config: Record<string, unknown> | null;
  readonly weight: number;
  readonly required: boolean;
  readonly position: number;
}

export interface ProjectGradingRequestedPayload extends AsyncMessagePayload {
  readonly submissionId: string;
  readonly checkpointId: string;
  readonly repository: {
    readonly provider: 'GITHUB';
    readonly owner: string;
    readonly name: string;
    readonly commitSha: string;
    readonly cloneUrl: string;
  };
  readonly branch: string | null;
  readonly deploymentUrl: string | null;
  readonly limits: {
    readonly maxRepositoryBytes: number;
    readonly cloneTimeoutMs: number;
    readonly gradingTimeoutMs: number;
    readonly buildTimeoutMs: number;
    readonly testTimeoutMs: number;
    readonly maxOutputBytes: number;
    readonly cpuLimit: number;
    readonly memoryMb: number;
    readonly pidsLimit: number;
  };
  readonly passScore: number;
  readonly criteria: readonly ProjectRubricCriterionPayload[];
}

export interface ProjectGradingStartedPayload extends AsyncMessagePayload {
  readonly submissionId: string;
}

export interface ProjectRubricResultPayload {
  readonly criterionId: string;
  readonly title: string;
  readonly status: ProjectRubricResultStatusPayload;
  readonly scoreEarned: number;
  readonly maxScore: number;
  readonly feedback: string | null;
  readonly details: Record<string, unknown> | null;
}

export interface ProjectGradingCompletedPayload extends AsyncMessagePayload {
  readonly submissionId: string;
  readonly autoScore: number;
  readonly score: number;
  readonly passed: boolean;
  readonly manualReviewPending: boolean;
  readonly summary: string | null;
  readonly results: readonly ProjectRubricResultPayload[];
}

export interface ProjectGradingFailedPayload extends AsyncMessagePayload {
  readonly submissionId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly retryable: boolean;
}

export interface ProjectGradingTimedOutPayload extends AsyncMessagePayload {
  readonly submissionId: string;
  readonly durationMs: number;
  readonly errorCode: string;
  readonly results: readonly ProjectRubricResultPayload[];
}

export const PROJECT_EXCHANGE = 'project.events';
export const PROJECT_GRADING_QUEUE = 'project.grading.requests';
export const PROJECT_GRADING_DLQ = 'project.grading.requests.dlq';
export const PROJECT_GRADING_RESULT_QUEUE = 'project.grading.results';

export const PROJECT_GRADING_ROUTING_KEYS = {
  requested: 'project.grading.requested',
  started: 'project.grading.started',
  completed: 'project.grading.completed',
  failed: 'project.grading.failed',
  timedOut: 'project.grading.timed_out',
} as const;
