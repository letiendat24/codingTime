import type { ProjectAutoCheckType, ProjectCriterionType, ProjectRubricResultStatus, ProjectSubmissionStatus, RepositoryProvider } from '@prisma/client';

export interface ProjectRubricCriterionResponse {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly type: ProjectCriterionType;
  readonly autoCheckType: ProjectAutoCheckType | null;
  readonly config: unknown;
  readonly weight: number;
  readonly required: boolean;
  readonly position: number;
}

export interface ProjectConfigResponse {
  readonly id: string;
  readonly checkpointId: string;
  readonly repositoryProvider: RepositoryProvider;
  readonly defaultBranch: string | null;
  readonly requireDeploymentUrl: boolean;
  readonly maxRepositoryBytes: string;
  readonly maxBuildTimeMs: number;
  readonly maxTestTimeMs: number;
  readonly passScore: number;
}

export interface ProjectSubmissionDetailResponse {
  readonly id: string;
  readonly checkpointId: string;
  readonly repositoryUrl: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly branch: string | null;
  readonly commitSha: string;
  readonly deploymentUrl: string | null;
  readonly status: ProjectSubmissionStatus;
  readonly score: number | null;
  readonly passed: boolean | null;
  readonly submittedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly failedAt: string | null;
  readonly grade: {
    readonly score: number;
    readonly passed: boolean;
    readonly autoScore: number;
    readonly manualScore: number | null;
    readonly summary: string | null;
    readonly results: readonly {
      readonly id: string;
      readonly criterionId: string | null;
      readonly title: string;
      readonly status: ProjectRubricResultStatus;
      readonly scoreEarned: number;
      readonly maxScore: number;
      readonly feedback: string | null;
    }[];
  } | null;
}
