import type { CheckpointProgressStatus, VideoCheckpointType, VideoPracticeBehavior, VideoPracticeVerificationMode, VideoWorkspaceType } from '@prisma/client';
import type { CodeAlongConfigSource, GeneratedPracticeRule } from '@codesync/shared';

export interface VideoProgressState {
  readonly lastPositionSeconds: number;
  readonly furthestPositionSeconds: number;
  readonly watchedPercent: number;
  readonly completed: boolean;
}

export interface StudentCheckpoint {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly type: VideoCheckpointType;
  readonly title: string;
  readonly description: string | null;
  readonly required: boolean;
  readonly pauseVideo: boolean;
  readonly completed: boolean;
  readonly practiceEnabled: boolean;
  readonly practiceConfigMode: CodeAlongConfigSource;
  readonly practiceVerificationMode: VideoPracticeVerificationMode;
  readonly practiceBehavior: VideoPracticeBehavior;
  readonly practiceSnapshotId: string | null;
  readonly practiceTargetFilePath: string | null;
  readonly practiceTargetStartLine: number | null;
  readonly practiceTargetEndLine: number | null;
}

export interface CodeSnapshotMetadata {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly title: string | null;
  readonly language: string;
}

export interface InteractiveVideoPlaybackResponse {
  readonly videoAssetId: string;
  readonly playbackUrl: string;
  readonly durationSeconds: number;
  readonly progress: VideoProgressState;
  readonly checkpoints: readonly StudentCheckpoint[];
  readonly codeSnapshots: readonly CodeSnapshotMetadata[];
}

export interface CodeAlongConfigResponse {
  readonly enabled: boolean;
  readonly language: string;
  readonly entryFile: string | null;
  readonly workspaceType: VideoWorkspaceType;
  readonly capabilities: VideoWorkspaceCapabilities;
  readonly defaultPracticeBehavior: VideoPracticeBehavior;
  readonly defaultVerificationStrategy: string;
}

export interface StudentCodeAlongResponse extends CodeAlongConfigResponse {
  readonly workspaceId: string | null;
  readonly snapshots: readonly CodeSnapshotMetadata[];
}

export interface VideoWorkspaceCapabilities {
  readonly allowEditFiles: boolean;
  readonly allowCreateFiles: boolean;
  readonly allowCreateFolders: boolean;
  readonly allowRenameFiles: boolean;
  readonly allowDeleteFiles: boolean;
  readonly allowRun: boolean;
  readonly allowCheck: boolean;
  readonly allowJudge: boolean;
}

export interface VideoProgressResponse extends VideoProgressState {
  readonly lessonCompleted: boolean;
}

export interface InstructorCheckpointPracticeResponse {
  readonly configMode: CodeAlongConfigSource;
  readonly practiceEnabled: boolean;
  readonly behavior: VideoPracticeBehavior;
  readonly verificationMode: VideoPracticeVerificationMode;
  readonly workspaceType: VideoWorkspaceType;
  readonly capabilities: VideoWorkspaceCapabilities;
  readonly targetFiles: readonly string[];
  readonly generatedRules: readonly GeneratedPracticeRule[];
  readonly summary: string;
  readonly reason: string;
}

export interface InstructorCheckpointResponse {
  readonly id: string;
  readonly videoAssetId: string | null;
  readonly lessonId: string;
  readonly timestampSeconds: number;
  readonly type: VideoCheckpointType;
  readonly title: string;
  readonly description: string | null;
  readonly required: boolean;
  readonly pauseVideo: boolean;
  readonly position: number;
  readonly practiceEnabled: boolean;
  readonly practiceConfigMode: CodeAlongConfigSource;
  readonly practiceVerificationMode: VideoPracticeVerificationMode;
  readonly practiceBehavior: VideoPracticeBehavior;
  readonly practiceSnapshotId: string | null;
  readonly practiceTargetFilePath: string | null;
  readonly practiceTargetStartLine: number | null;
  readonly practiceTargetEndLine: number | null;
  readonly practice?: InstructorCheckpointPracticeResponse | undefined;
}

export interface CheckpointCompletionResponse {
  readonly id: string;
  readonly status: CheckpointProgressStatus;
  readonly completedAt: string | null;
  readonly lessonCompleted: boolean;
}

export interface CodeSnapshotResponse extends CodeSnapshotMetadata {
  readonly videoAssetId: string;
  readonly lessonId: string;
  readonly files: readonly {
    readonly path: string;
    readonly content: string;
  }[];
}

export interface PracticeStepResponse {
  readonly id: string;
  readonly lessonId: string;
  readonly videoAssetId: string | null;
  readonly timestampSeconds: number;
  readonly timestampMs: number;
  readonly title: string;
  readonly instruction: string | null;
  readonly required: boolean;
  readonly behavior: VideoPracticeBehavior;
  readonly verificationMode: VideoPracticeVerificationMode;
  readonly snapshotId: string | null;
  readonly targetFilePath: string | null;
  readonly targetStartLine: number | null;
  readonly targetEndLine: number | null;
  readonly verificationRules: unknown;
  readonly status: CheckpointProgressStatus;
  readonly completed: boolean;
}

export type PracticeVerificationStatus = 'PASSED' | 'FAILED' | 'UNAVAILABLE';

export interface PracticeStepCompletionResponse {
  readonly id: string;
  readonly status: CheckpointProgressStatus;
  readonly completedAt: string | null;
  readonly passed: boolean;
  readonly message: string;
  readonly lessonCompleted: boolean;
  readonly verification: {
    readonly status: PracticeVerificationStatus;
    readonly verificationMode: VideoPracticeVerificationMode;
    readonly details: readonly string[];
    readonly summary?: string;
    readonly guidance?: string | null;
    readonly requirements?: readonly {
      readonly label: string;
      readonly status: 'PASS' | 'NEEDS_FIX' | 'UNKNOWN';
      readonly feedback: string;
    }[];
    readonly attemptId?: string | null;
    readonly cached?: boolean;
    readonly stale?: boolean;
  };
}
