export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
    navigation: ['auth', 'navigation'] as const,
  },
  courses: {
    all: (filters?: Record<string, unknown>) => ['courses', filters ?? {}] as const,
    detail: (slug: string) => ['courses', 'detail', slug] as const,
    progress: (courseId?: string) => ['learning', 'course-progress', courseId ?? 'unknown'] as const,
  },
  learning: {
    dashboard: ['learning', 'dashboard'] as const,
    history: (filters?: Record<string, unknown>) => ['learning', 'history', filters ?? {}] as const,
    video: (lessonId: string) => ['learning', 'video', lessonId] as const,
    codeAlong: (lessonId: string) => ['learning', 'code-along', lessonId] as const,
    snapshot: (snapshotId?: string) => ['learning', 'snapshot', snapshotId ?? 'none'] as const,
  },
  workspace: {
    detail: (workspaceId: string) => ['workspace', workspaceId] as const,
    revisions: (workspaceId: string) => ['workspace', workspaceId, 'revisions'] as const,
    executions: (workspaceId: string) => ['workspace', workspaceId, 'executions'] as const,
  },
  execution: {
    detail: (executionId?: string | null) => ['execution', executionId ?? 'none'] as const,
  },
  judge: {
    submission: (submissionId?: string | null) => ['judge', 'submission', submissionId ?? 'none'] as const,
  },
  project: {
    submissions: (checkpointId: string) => ['project', 'submissions', checkpointId] as const,
    submission: (submissionId?: string | null) => ['project', 'submission', submissionId ?? 'none'] as const,
  },
  practice: {
    list: (filters?: Record<string, unknown>) => ['practice', 'list', filters ?? {}] as const,
    detail: (slug: string) => ['practice', 'detail', slug] as const,
    stats: ['practice', 'stats'] as const,
    submissions: (problemId?: string) => ['practice', 'submissions', problemId ?? 'none'] as const,
  },
  notifications: {
    list: (filters?: Record<string, unknown>) => ['notifications', 'list', filters ?? {}] as const,
    recent: ['notifications', 'recent'] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    preferences: ['notifications', 'preferences'] as const,
  },
  admin: {
    dashboard: ['admin', 'dashboard'] as const,
    users: (filters?: Record<string, unknown>) => ['admin', 'users', filters ?? {}] as const,
    operations: ['admin', 'operations'] as const,
  },
} as const;
