import type { ExecutionStatus } from '@prisma/client';

export interface WorkspaceFileResponse {
  readonly path: string;
  readonly content: string;
}

export interface WorkspaceResponse {
  readonly id: string;
  readonly checkpointId: string | null;
  readonly lessonId: string | null;
  readonly practiceProblemId: string | null;
  readonly language: string;
  readonly entryFile: string;
  readonly lastOpenedAt: string | null;
  readonly files: readonly WorkspaceFileResponse[];
}

export interface WorkspaceRevisionResponse {
  readonly id: string;
  readonly workspaceId: string;
  readonly source: string;
  readonly createdAt: string;
}

export interface ExecutionQueuedResponse {
  readonly id: string;
  readonly status: ExecutionStatus;
}

export interface ExecutionDetailResponse {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: ExecutionStatus;
  readonly language: string;
  readonly entryFile: string;
  readonly createdAt: string;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly failedAt: string | null;
  readonly result: {
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly durationMs: number;
    readonly memoryBytes: string | null;
    readonly errorCode: string | null;
  } | null;
}

export interface ExecutionHistoryItem {
  readonly id: string;
  readonly status: ExecutionStatus;
  readonly createdAt: string;
  readonly durationMs: number | null;
  readonly exitCode: number | null;
}
