export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function getAccessToken() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.localStorage.getItem('codesync_access_token') ?? undefined;
}

export function storeAccessToken(accessToken: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem('codesync_access_token', accessToken);
}

export function clearAccessToken() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem('codesync_access_token');
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string | undefined;
  readonly details?: readonly string[] | undefined;

  constructor(message: string, statusCode: number, code?: string, details?: readonly string[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export type RefreshResult =
  | { readonly status: 'success'; readonly accessToken: string; readonly user: CurrentUser }
  | { readonly status: 'invalid_session'; readonly error: ApiError }
  | { readonly status: 'network_error'; readonly error: Error };

let inFlightRefreshPromise: Promise<RefreshResult> | null = null;

export async function refreshAccessToken(): Promise<RefreshResult> {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async (): Promise<RefreshResult> => {
    try {
      const response = await fetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | {
              readonly error?: {
                readonly message?: string;
                readonly code?: string;
                readonly details?: readonly string[];
              };
            }
          | undefined;

        const error = new ApiError(
          body?.error?.message ?? 'Refresh token invalid or expired',
          response.status,
          body?.error?.code,
          body?.error?.details,
        );

        // Only genuine 401/403 responses indicate the session is truly dead/invalid/revoked
        if (response.status === 401 || response.status === 403) {
          clearAccessToken();
          return { status: 'invalid_session', error };
        }

        // 5xx responses represent temporary server errors, not an invalid session
        return { status: 'network_error', error };
      }

      const data = (await response.json()) as { accessToken: string; user: CurrentUser };
      storeAccessToken(data.accessToken);
      return { status: 'success', accessToken: data.accessToken, user: data.user };
    } catch (err: unknown) {
      // Network drop / offline error
      const error = err instanceof Error ? err : new Error('Network error during token refresh');
      return { status: 'network_error', error };
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
}

export interface RequestJsonOptions extends RequestInit {
  readonly skipAuthRefresh?: boolean | undefined;
  readonly _isRetry?: boolean | undefined;
}

export async function requestJson<T>(path: string, options: RequestJsonOptions = {}): Promise<T> {
  const { skipAuthRefresh = false, _isRetry = false, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  const accessToken = getAccessToken();

  if (!headers.has('Content-Type') && fetchOptions.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  // Intercept 401 and transparently attempt single-flight refresh & retry
  if (response.status === 401 && !skipAuthRefresh && !_isRetry) {
    const refreshResult = await refreshAccessToken();

    if (refreshResult.status === 'success') {
      const retryHeaders = new Headers(fetchOptions.headers);
      if (!retryHeaders.has('Content-Type') && fetchOptions.body) {
        retryHeaders.set('Content-Type', 'application/json');
      }
      retryHeaders.set('Authorization', `Bearer ${refreshResult.accessToken}`);

      return requestJson<T>(path, {
        ...fetchOptions,
        headers: retryHeaders,
        skipAuthRefresh: true,
        _isRetry: true,
      });
    }

    if (refreshResult.status === 'network_error') {
      throw refreshResult.error;
    }

    throw refreshResult.error;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | {
          readonly error?: {
            readonly message?: string;
            readonly code?: string;
            readonly details?: readonly string[];
          };
        }
      | undefined;
    const message = body?.error?.message ?? (response.status === 404 ? 'Resource not found' : 'Request failed');
    throw new ApiError(message, response.status, body?.error?.code, body?.error?.details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export interface VideoUploadIntent {
  readonly videoAssetId: string;
  readonly uploadUrl: string;
  readonly objectKey: string;
  readonly expiresAt: string;
}

export interface VideoStatus {
  readonly id: string;
  readonly lessonId: string;
  readonly status: string;
  readonly progress: number;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: string;
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly masterPlaylistObjectKey: string | null;
  readonly thumbnailObjectKey: string | null;
  readonly readyAt: string | null;
  readonly failedAt: string | null;
  readonly renditions: readonly {
    readonly quality: string;
    readonly width: number;
    readonly height: number;
    readonly bitrate: number;
    readonly playlistObjectKey: string;
  }[];
  readonly latestJob: {
    readonly jobId: string;
    readonly status: string;
    readonly attemptCount: number;
    readonly lastErrorCode: string | null;
    readonly lastErrorMessage: string | null;
  } | null;
  readonly playbackUrl?: string | null;
}

export interface VideoPlayback {
  readonly videoAssetId: string;
  readonly playbackUrl: string;
  readonly durationSeconds: number;
  readonly progress: {
    readonly lastPositionSeconds: number;
    readonly furthestPositionSeconds: number;
    readonly watchedPercent: number;
    readonly completed: boolean;
  };
  readonly checkpoints: readonly VideoCheckpoint[];
  readonly codeSnapshots: readonly CodeSnapshotMetadata[];
}

export type TranscriptSource = 'MANUAL' | 'FILE_UPLOAD' | 'AUTO_GENERATED';
export type TranscriptStatus = 'DRAFT' | 'READY' | 'FAILED';

export interface TranscriptSegment {
  readonly id: string;
  readonly order?: number;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly text: string;
}

export interface StudentTranscriptTrack {
  readonly id: string;
  readonly language: string;
  readonly title: string | null;
  readonly status: 'READY';
  readonly segmentCount: number;
}

export interface StudentTranscript {
  readonly id: string;
  readonly language: string;
  readonly title: string | null;
  readonly segments: readonly TranscriptSegment[];
}

export interface InstructorTranscript {
  readonly id: string;
  readonly videoAssetId: string;
  readonly language: string;
  readonly source: TranscriptSource;
  readonly status: TranscriptStatus;
  readonly title: string | null;
  readonly segmentCount: number;
  readonly segments: readonly TranscriptSegment[];
}

export interface CodeAlongMetadata {
  readonly enabled: boolean;
  readonly language: string;
  readonly entryFile: string | null;
  readonly workspaceId: string | null;
  readonly snapshots: readonly CodeSnapshotMetadata[];
}

export type VideoPracticeVerificationMode = 'NONE' | 'CODE_COMPARE' | 'TESTS';
export type VideoPracticeBehavior = 'GUIDED' | 'REQUIRED';
export type PracticeProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface VideoPracticeStep {
  readonly id: string;
  readonly lessonId: string;
  readonly videoAssetId: string | null;
  readonly timestampSeconds: number;
  readonly title: string;
  readonly instruction: string | null;
  readonly required: boolean;
  readonly behavior: VideoPracticeBehavior;
  readonly verificationMode: VideoPracticeVerificationMode;
  readonly snapshotId: string | null;
  readonly targetFilePath: string | null;
  readonly targetStartLine: number | null;
  readonly targetEndLine: number | null;
  readonly status: PracticeProgressStatus;
  readonly completed: boolean;
}

export interface VideoCheckpoint {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly type: 'INFO' | 'QUIZ' | 'CODING' | 'PROJECT';
  readonly title: string;
  readonly description: string | null;
  readonly required: boolean;
  readonly pauseVideo: boolean;
  readonly completed: boolean;
  readonly practiceEnabled?: boolean;
  readonly practiceVerificationMode?: VideoPracticeVerificationMode;
  readonly practiceBehavior?: VideoPracticeBehavior;
  readonly practiceSnapshotId?: string | null;
  readonly practiceTargetFilePath?: string | null;
  readonly practiceTargetStartLine?: number | null;
  readonly practiceTargetEndLine?: number | null;
}

export interface CodeSnapshotMetadata {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly title: string | null;
  readonly language: string;
}

export interface CodeSnapshotDetail extends CodeSnapshotMetadata {
  readonly videoAssetId: string;
  readonly lessonId: string;
  readonly files: readonly {
    readonly path: string;
    readonly content: string;
  }[];
}

export interface WorkspaceFile {
  readonly path: string;
  readonly content: string;
}

export interface Workspace {
  readonly id: string;
  readonly checkpointId: string | null;
  readonly lessonId: string | null;
  readonly practiceProblemId: string | null;
  readonly language: string;
  readonly entryFile: string;
  readonly lastOpenedAt: string | null;
  readonly files: readonly WorkspaceFile[];
}

export interface WorkspaceRevision {
  readonly id: string;
  readonly workspaceId: string;
  readonly source: string;
  readonly createdAt: string;
}

export interface ExecutionDetail {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';
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

export interface JudgeSubmissionDetail {
  readonly id: string;
  readonly workspaceId: string;
  readonly checkpointId: string | null;
  readonly practiceProblemId: string | null;
  readonly status: 'QUEUED' | 'RUNNING' | 'ACCEPTED' | 'REJECTED' | 'FAILED' | 'TIMED_OUT';
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
    readonly testResults: readonly {
      readonly id: string;
      readonly testCaseId: string | null;
      readonly name: string;
      readonly visibility: 'PUBLIC' | 'HIDDEN';
      readonly status: string;
      readonly scoreEarned: number;
      readonly actualOutput: string | null;
      readonly stderr: string | null;
      readonly durationMs: number;
      readonly memoryBytes: string | null;
    }[];
  } | null;
}

export type QuizQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
export type QuizAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED';

export interface StudentQuizOption {
  readonly id: string;
  readonly text: string;
  readonly position: number;
}

export interface StudentQuizQuestion {
  readonly id: string;
  readonly type: QuizQuestionType;
  readonly prompt: string;
  readonly points: number;
  readonly position: number;
  readonly options: readonly StudentQuizOption[];
}

export interface StudentQuizAttemptSummary {
  readonly id: string;
  readonly attemptNumber: number;
  readonly status: QuizAttemptStatus;
  readonly startedAt: string;
  readonly submittedAt: string | null;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly percentage: number | null;
  readonly passed: boolean | null;
}

export interface StudentQuiz {
  readonly id: string;
  readonly lessonId: string;
  readonly title: string;
  readonly instructions: string | null;
  readonly passScore: number;
  readonly questionCount: number;
  readonly questions: readonly StudentQuizQuestion[];
  readonly attempts: readonly StudentQuizAttemptSummary[];
}

export interface QuizAttemptDetail {
  readonly id: string;
  readonly quizId: string;
  readonly status: QuizAttemptStatus;
  readonly startedAt: string;
  readonly submittedAt: string | null;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly percentage: number | null;
  readonly passed: boolean | null;
  readonly showDetailedResult: boolean;
  readonly answers: readonly {
    readonly questionId: string;
    readonly selectedOptionIds: readonly string[];
    readonly isCorrect?: boolean | null;
    readonly scoreEarned?: number | null;
    readonly correctOptionIds?: readonly string[];
    readonly explanation?: string | null;
  }[];
}

export interface InstructorQuizOption {
  readonly id: string;
  readonly text: string;
  readonly isCorrect: boolean;
  readonly position: number;
}

export interface InstructorQuizQuestion {
  readonly id: string;
  readonly type: QuizQuestionType;
  readonly prompt: string;
  readonly explanation: string | null;
  readonly points: number;
  readonly position: number;
  readonly options: readonly InstructorQuizOption[];
}

export interface InstructorQuiz {
  readonly id: string;
  readonly lessonId: string;
  readonly title: string;
  readonly instructions: string | null;
  readonly passScore: number;
  readonly shuffleQuestions: boolean;
  readonly shuffleOptions: boolean;
  readonly showResultImmediately: boolean;
  readonly questions: readonly InstructorQuizQuestion[];
}

export interface StudentCodingLessonDetails {
  readonly lessonId: string;
  readonly title: string;
  readonly description: string | null;
  readonly checkpointId: string | null;
  readonly config: {
    readonly language: string;
    readonly entryFile: string;
    readonly passScore: number;
    readonly scoringMode: 'ALL_OR_NOTHING' | 'WEIGHTED';
    readonly timeLimitMs: number;
    readonly memoryLimitMb: number;
    readonly publicTestCases: readonly {
      readonly id: string;
      readonly name: string;
      readonly input: string;
      readonly expectedOutput: string;
      readonly weight: number;
      readonly position: number;
    }[];
  } | null;
}

export interface InstructorCodingConfigResponse {
  readonly lessonId: string;
  readonly config: {
    readonly id: string;
    readonly language: string;
    readonly entryFile: string;
    readonly starterFiles: readonly { readonly path: string; readonly content: string }[];
    readonly timeLimitMs: number;
    readonly memoryLimitMb: number;
    readonly passScore: number;
    readonly scoringMode: 'ALL_OR_NOTHING' | 'WEIGHTED';
    readonly testCases: readonly {
      readonly id: string;
      readonly name: string;
      readonly visibility: 'PUBLIC' | 'HIDDEN';
      readonly input: string;
      readonly expectedOutput: string;
      readonly weight: number;
      readonly position: number;
    }[];
  } | null;
}

export interface ProjectSubmissionDetail {
  readonly id: string;
  readonly checkpointId: string;
  readonly repositoryUrl: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly branch: string | null;
  readonly commitSha: string;
  readonly deploymentUrl: string | null;
  readonly status: 'QUEUED' | 'CLONING' | 'GRADING' | 'AWAITING_REVIEW' | 'PASSED' | 'FAILED' | 'ERROR' | 'TIMED_OUT';
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
      readonly status: string;
      readonly scoreEarned: number;
      readonly maxScore: number;
      readonly feedback: string | null;
    }[];
  } | null;
}

export interface ProjectRubricCriterion {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly type: 'AUTO' | 'MANUAL';
  readonly autoCheckType: 'FILE_EXISTS' | 'JSON_FIELD' | 'BUILD_SUCCESS' | 'TEST_SUCCESS' | 'DEPLOYMENT_HEALTH' | null;
  readonly config: unknown;
  readonly weight: number;
  readonly required: boolean;
  readonly position: number;
}

export interface ProjectCheckpointConfig {
  readonly id: string;
  readonly checkpointId: string;
  readonly repositoryProvider: 'GITHUB';
  readonly defaultBranch: string | null;
  readonly requireDeploymentUrl: boolean;
  readonly maxRepositoryBytes: string;
  readonly maxBuildTimeMs: number;
  readonly maxTestTimeMs: number;
  readonly passScore: number;
}

export interface ProjectCheckpointConfigResponse {
  readonly checkpointId: string;
  readonly config: ProjectCheckpointConfig | null;
  readonly criteria: readonly ProjectRubricCriterion[];
}

export interface CourseSummary {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly shortDescription: string | null;
  readonly difficulty: string;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly tags: readonly {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  }[];
  readonly instructor: {
    readonly id: string;
    readonly displayName: string;
  };
}

export interface CourseDetail extends CourseSummary {
  readonly status?: string;
  readonly description: string | null;
  readonly modules: readonly {
    readonly id: string;
    readonly title: string;
    readonly description: string | null;
    readonly position: number;
    readonly lessons: readonly {
      readonly id: string;
      readonly title: string;
      readonly description: string | null;
      readonly position: number;
      readonly lessonType: string;
    }[];
  }[];
}

export interface EnrollmentSummary {
  readonly enrollmentId: string;
  readonly status: string;
  readonly enrolledAt: string;
  readonly progressPercent: number;
  readonly completedLessons: number;
  readonly totalLessons: number;
  readonly lastAccessedAt: string | null;
  readonly course: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
    readonly status: string;
  };
}

export interface ResumeLearning {
  readonly course: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
  } | null;
  readonly lesson: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly progress: {
    readonly coursePercent: number;
    readonly lessonStatus: string | null;
  } | null;
}

export interface LearningActivity {
  readonly id: string;
  readonly type: string;
  readonly course: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly lesson: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly createdAt: string;
}

export interface CourseLearningSummary {
  readonly course: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
  };
  readonly enrollment: {
    readonly id: string;
    readonly status: string;
  };
  readonly progress: {
    readonly totalLessons: number;
    readonly completedLessons: number;
    readonly progressPercent: number;
    readonly lastAccessedAt: string | null;
    readonly completedAt: string | null;
  };
  readonly lessons: readonly {
    readonly id: string;
    readonly title: string;
    readonly moduleId: string;
    readonly moduleTitle: string;
    readonly position: number;
    readonly status: string;
    readonly startedAt: string | null;
    readonly lastAccessedAt: string | null;
    readonly completedAt: string | null;
  }[];
}

export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

export type NotificationCategory = 'LEARNING' | 'PRACTICE' | 'PROJECT' | 'COURSE' | 'SYSTEM';

export type NotificationType =
  | 'JUDGE_COMPLETED'
  | 'PRACTICE_SOLVED'
  | 'PROJECT_SUBMITTED'
  | 'PROJECT_GRADED'
  | 'PROJECT_MANUAL_REVIEW_REQUIRED'
  | 'VIDEO_PROCESSING_COMPLETED'
  | 'VIDEO_PROCESSING_FAILED'
  | 'COURSE_PUBLISHED'
  | 'COURSE_UPDATED'
  | 'ADMIN_OPERATION_ALERT';

export interface NotificationItem {
  readonly id: string;
  readonly type: NotificationType;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly message: string;
  readonly data: unknown;
  readonly actionUrl: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NotificationPreferences {
  readonly learningEnabled: boolean;
  readonly practiceEnabled: boolean;
  readonly projectEnabled: boolean;
  readonly courseEnabled: boolean;
  readonly systemEnabled: boolean;
}

export interface PracticeTag {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface PracticeProgressSummary {
  readonly status: 'NOT_STARTED' | 'ATTEMPTED' | 'SOLVED';
  readonly attemptCount: number;
  readonly bestScore: number | null;
  readonly solvedAt: string | null;
}

export interface PracticeProblemSummary {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  readonly language: string;
  readonly tags: readonly PracticeTag[];
  readonly progress: PracticeProgressSummary;
  readonly publicTestCount: number;
}

export interface PracticeProblemDetail {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  readonly language: string;
  readonly entryFile: string;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly passScore: number;
  readonly tags: readonly PracticeTag[];
  readonly publicTests: readonly {
    readonly id: string;
    readonly name: string;
    readonly input: string;
    readonly expectedOutput: string;
    readonly weight: number;
    readonly position: number;
  }[];
  readonly progress: PracticeProgressSummary;
}

export interface InstructorPracticeProblem extends PracticeProblemDetail {
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly starterFiles: readonly WorkspaceFile[];
  readonly scoringMode: 'ALL_OR_NOTHING' | 'WEIGHTED';
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  readonly hiddenTestCount: number;
  readonly testCases: readonly {
    readonly id: string;
    readonly name: string;
    readonly visibility: 'PUBLIC' | 'HIDDEN';
    readonly input: string;
    readonly expectedOutput: string;
    readonly weight: number;
    readonly position: number;
  }[];
}

export interface PracticeStats {
  readonly totalProblems: number;
  readonly attempted: number;
  readonly solved: number;
  readonly recent: readonly {
    readonly problem: { readonly id: string; readonly title: string; readonly slug: string };
    readonly status: 'NOT_STARTED' | 'ATTEMPTED' | 'SOLVED';
    readonly attemptCount: number;
    readonly bestScore: number | null;
    readonly lastAttemptedAt: string | null;
    readonly solvedAt: string | null;
  }[];
}

export interface CurrentUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly roles: readonly string[];
}

export interface AdminDashboard {
  readonly period: string;
  readonly users: {
    readonly total: number;
    readonly active: number;
    readonly suspended: number;
    readonly disabled: number;
    readonly students: number;
    readonly instructors: number;
    readonly admins: number;
  };
  readonly courses: {
    readonly total: number;
    readonly draft: number;
    readonly published: number;
    readonly archived: number;
    readonly enrollments: number;
    readonly activeEnrollments: number;
    readonly completedEnrollments: number;
  };
  readonly learning: Record<string, number>;
  readonly operations: {
    readonly videos: Record<string, number>;
    readonly codeExecutions: Record<string, number>;
    readonly judgeSubmissions: Record<string, number>;
    readonly projectGrading: Record<string, number>;
    readonly failures: Record<string, number>;
  };
  readonly health: Record<string, 'ok' | 'error'>;
  readonly recentActivity: readonly {
    readonly id: string;
    readonly type: string;
    readonly createdAt: string;
    readonly user: { readonly id: string; readonly displayName: string; readonly email: string };
    readonly course: { readonly id: string; readonly title: string } | null;
    readonly lesson: { readonly id: string; readonly title: string } | null;
  }[];
}

export interface AdminUserSummary {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly status: string;
  readonly createdAt: string;
  readonly lastActivityAt: string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  readonly updatedAt: string;
  readonly activeSessionCount: number;
  readonly enrollmentCount: number;
  readonly ownedCourseCount: number;
  readonly recentActivity: readonly {
    readonly id: string;
    readonly type: string;
    readonly createdAt: string;
    readonly courseTitle: string | null;
    readonly lessonTitle: string | null;
  }[];
}

export interface AdminInstructorSummary extends AdminUserSummary {
  readonly courseCount: number;
  readonly publishedCourseCount: number;
  readonly enrollmentCount: number;
}

export interface AdminCourseSummary {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly status: string;
  readonly difficulty: string;
  readonly instructor: { readonly id: string; readonly displayName: string; readonly email: string };
  readonly moduleCount: number;
  readonly lessonCount: number;
  readonly enrollmentCount: number;
  readonly createdAt: string;
  readonly publishedAt: string | null;
}

export interface AdminEnrollmentSummary {
  readonly id: string;
  readonly student: { readonly id: string; readonly displayName: string; readonly email: string };
  readonly course: { readonly id: string; readonly title: string; readonly slug: string };
  readonly status: string;
  readonly progressPercent: number | null;
  readonly enrolledAt: string;
  readonly completedAt: string | null;
}

export interface AdminVideoSummary {
  readonly id: string;
  readonly lesson: { readonly id: string; readonly title: string };
  readonly course: { readonly id: string; readonly title: string };
  readonly instructor: { readonly id: string; readonly displayName: string; readonly email: string };
  readonly status: string;
  readonly processingProgress: number;
  readonly createdAt: string;
  readonly readyAt: string | null;
  readonly failedAt: string | null;
  readonly latestJob: {
    readonly jobId: string;
    readonly status: string;
    readonly attemptCount: number;
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
  } | null;
}

export interface AdminExecutionSummary {
  readonly id: string;
  readonly user: { readonly id: string; readonly displayName: string; readonly email: string };
  readonly status: string;
  readonly language: string;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface AdminJudgeSubmissionSummary {
  readonly id: string;
  readonly user: { readonly id: string; readonly displayName: string; readonly email: string };
  readonly checkpoint: { readonly id: string; readonly title: string } | null;
  readonly practiceProblem: { readonly id: string; readonly title: string; readonly slug: string } | null;
  readonly course: { readonly id: string; readonly title: string } | null;
  readonly status: string;
  readonly score: number | null;
  readonly passed: boolean | null;
  readonly createdAt: string;
  readonly durationMs: number | null;
}

export interface AdminProjectSubmissionSummary {
  readonly id: string;
  readonly user: { readonly id: string; readonly displayName: string; readonly email: string };
  readonly checkpoint: { readonly id: string; readonly title: string };
  readonly course: { readonly id: string; readonly title: string } | null;
  readonly repository: { readonly provider: string; readonly owner: string; readonly name: string; readonly url: string };
  readonly commitSha: string;
  readonly status: string;
  readonly score: number | null;
  readonly manualReviewPending: boolean;
  readonly submittedAt: string;
  readonly completedAt: string | null;
}

export interface AdminAuditLogSummary {
  readonly id: string;
  readonly admin: { readonly id: string; readonly displayName: string; readonly email: string };
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly metadata: unknown;
  readonly createdAt: string;
}
