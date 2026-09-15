'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  CheckCircle,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Plus,
  RotateCcw,
  Video as VideoIcon,
  Code2,
  FolderGit2,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  PageSkeleton,
  Select,
  StatusBadge,
  Tabs,
} from '../../../../design-system';
import { useAuthGuard } from '../../../../features/auth/hooks/use-auth-guard';
import { ArticleEditor } from '../../../../features/instructor/components/article-editor';
import { VideoUploadStudio } from '../../../../features/instructor/components/video-upload-studio';
import { CodeAlongStudio } from '../../../../features/instructor/components/code-along-studio';
import {
  type CourseDetail,
  type InstructorCodingConfigResponse,
  type InstructorQuiz,
  type InstructorQuizQuestion,
  type ProjectCheckpointConfigResponse,
  type ProjectRubricCriterion,
  type VideoCheckpoint,
  requestJson,
} from '../../../../lib/api';
import { useI18n } from '../../../../providers/i18n-provider';
import { useToast } from '../../../../providers/toast-provider';

interface CourseResponse {
  readonly course: CourseDetail;
}

export default function InstructorCourseDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const { isLoading: authLoading } = useAuthGuard({ requiredRole: 'INSTRUCTOR' });

  const [activeTab, setActiveTab] = useState<'curriculum' | 'settings'>('curriculum');
  const [moduleTitle, setModuleTitle] = useState('');
  const [activeModuleIdForLesson, setActiveModuleIdForLesson] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonType, setLessonType] = useState('VIDEO');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);

  const course = useQuery({
    queryKey: ['instructor-course', params.id],
    queryFn: () => requestJson<CourseResponse>(`/instructor/courses/${params.id}`),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['instructor-course', params.id] });
  };

  const createModule = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/courses/${params.id}/modules`, {
        method: 'POST',
        body: JSON.stringify({ title: moduleTitle.trim() }),
      }),
    onSuccess: () => {
      setModuleTitle('');
      toast.success('Module created successfully');
      void invalidate();
    },
    onError: (error) => {
      toast.error('Failed to create module', error instanceof Error ? error.message : undefined);
    },
  });

  const createLesson = useMutation({
    mutationFn: (targetModuleId: string) =>
      requestJson(`/instructor/modules/${targetModuleId}/lessons`, {
        method: 'POST',
        body: JSON.stringify({ title: lessonTitle.trim(), lessonType }),
      }),
    onSuccess: () => {
      setLessonTitle('');
      setActiveModuleIdForLesson(null);
      toast.success('Lesson created successfully');
      void invalidate();
    },
    onError: (error) => {
      toast.error('Failed to create lesson', error instanceof Error ? error.message : undefined);
    },
  });

  const publish = useMutation({
    mutationFn: () => requestJson(`/instructor/courses/${params.id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Course published!', 'Your course is now live and visible in the course catalog.');
      void invalidate();
    },
    onError: (error) => {
      toast.error('Failed to publish course', error instanceof Error ? error.message : undefined);
    },
  });

  const unpublish = useMutation({
    mutationFn: () => requestJson(`/instructor/courses/${params.id}/unpublish`, { method: 'POST' }),
    onSuccess: () => {
      setShowUnpublishDialog(false);
      toast.success('Course moved to Draft', 'You can now make edits and re-publish when ready.');
      void invalidate();
    },
    onError: (error) => {
      toast.error('Failed to move course to Draft', error instanceof Error ? error.message : undefined);
    },
  });

  const archive = useMutation({
    mutationFn: () => requestJson(`/instructor/courses/${params.id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Course archived');
      void invalidate();
    },
    onError: (error) => {
      toast.error('Failed to archive course', error instanceof Error ? error.message : undefined);
    },
  });

  if (authLoading || course.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-6">
        <PageSkeleton />
      </main>
    );
  }

  if (course.isError || !course.data) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Could not load instructor course."
          onRetry={() => void course.refetch()}
        />
      </main>
    );
  }

  const courseData = course.data.course;
  const isPublished = courseData.status === 'PUBLISHED';

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-8">
      {/* Move to Draft Confirmation Dialog */}
      <Dialog
        open={showUnpublishDialog}
        onClose={() => setShowUnpublishDialog(false)}
        title="Move Course to Draft?"
        description="This course is currently published. Moving it back to Draft will temporarily hide it from new learners while you edit it. Existing enrollments will remain unchanged."
      >
        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
          <Button
            variant="secondary"
            onClick={() => setShowUnpublishDialog(false)}
            disabled={unpublish.isPending}
          >
            Cancel
          </Button>
          <Button
            isLoading={unpublish.isPending}
            disabled={unpublish.isPending}
            onClick={() => unpublish.mutate()}
          >
            Move to Draft
          </Button>
        </div>
      </Dialog>

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/instructor/courses"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('instructor.courses')}</span>
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {courseData.title}
            </h1>
            <StatusBadge value={courseData.status} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isPublished ? (
            <Button
              isLoading={publish.isPending}
              onClick={() => {
                if (window.confirm('Publish course to public catalog?')) {
                  publish.mutate();
                }
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              <span>Publish Course</span>
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setShowUnpublishDialog(true)}
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                <span>Move to Draft</span>
              </Button>
              <Button
                variant="secondary"
                isLoading={archive.isPending}
                onClick={() => {
                  if (window.confirm('Archive this course?')) {
                    archive.mutate();
                  }
                }}
              >
                <Archive className="h-4 w-4 mr-1.5" />
                <span>Archive Course</span>
              </Button>
            </>
          )}

          <Link href={`/courses/${courseData.slug}`}>
            <Button variant="secondary">Preview as Student</Button>
          </Link>
        </div>
      </div>

      {/* Published Course Read-Only Banner */}
      {isPublished && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-foreground dark:border-sky-500/40 dark:bg-sky-950/40">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Course is Published (Read-Only)</p>
              <p className="text-xs text-muted-foreground">
                To edit modules, lessons, video content, or settings, move the course back to Draft.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowUnpublishDialog(true)}>
            Move to Draft
          </Button>
        </div>
      )}

      {/* Navigation Tabs */}
      <Tabs
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as 'curriculum' | 'settings')}
        items={[
          { id: 'curriculum', label: t('courses.curriculum'), icon: <Layers className="h-4 w-4" /> },
          { id: 'settings', label: t('common.settings'), icon: <FileText className="h-4 w-4" /> },
        ]}
      />

      {activeTab === 'curriculum' ? (
        <div className="space-y-6">
          {/* Add Module Bar (Only active when DRAFT) */}
          {!isPublished ? (
            <Card className="shadow-xs">
              <CardContent className="p-4">
                <form
                  className="flex flex-col sm:flex-row items-center gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!moduleTitle.trim()) return;
                    createModule.mutate();
                  }}
                >
                  <Input
                    className="flex-1"
                    placeholder="New module title (e.g. Module 1: Architecture & Foundation)"
                    value={moduleTitle}
                    onChange={(event) => setModuleTitle(event.target.value)}
                  />
                  <Button
                    type="submit"
                    isLoading={createModule.isPending}
                    disabled={createModule.isPending || !moduleTitle.trim()}
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    <span>{t('instructor.addModule')}</span>
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {/* Curriculum Modules */}
          {courseData.modules.length > 0 ? (
            <div className="space-y-4">
              {courseData.modules.map((module, mIndex) => (
                <Card key={module.id} className="overflow-hidden shadow-xs">
                  <CardHeader className="bg-muted/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-bold text-foreground">
                        Module {module.position || mIndex + 1}: {module.title}
                      </CardTitle>
                      <CardDescription>
                        {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}
                      </CardDescription>
                    </div>

                    {!isPublished ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setActiveModuleIdForLesson(module.id)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        <span>{t('instructor.addLesson')}</span>
                      </Button>
                    ) : null}
                  </CardHeader>

                  <CardContent className="p-4 space-y-4">
                    {/* Add Lesson Modal/Inline Form */}
                    {activeModuleIdForLesson === module.id ? (
                      <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                          Add Lesson to &quot;{module.title}&quot;
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Input
                            className="sm:col-span-2"
                            placeholder="Lesson title"
                            value={lessonTitle}
                            onChange={(event) => setLessonTitle(event.target.value)}
                          />
                          <Select
                            value={lessonType}
                            onChange={(event) => setLessonType(event.target.value)}
                          >
                            <option value="VIDEO">Video</option>
                            <option value="ARTICLE">Article</option>
                            <option value="CODING">Coding</option>
                            <option value="PROJECT">Project</option>
                            <option value="QUIZ">Quiz</option>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setActiveModuleIdForLesson(null)}
                          >
                            {t('common.cancel')}
                          </Button>
                          <Button
                            size="sm"
                            isLoading={createLesson.isPending}
                            disabled={createLesson.isPending || !lessonTitle.trim()}
                            onClick={() => createLesson.mutate(module.id)}
                          >
                            {t('instructor.addLesson')}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {/* Lessons list */}
                    {module.lessons.length > 0 ? (
                      <div className="space-y-3">
                        {module.lessons.map((lesson) => (
                          <div
                            key={lesson.id}
                            className="rounded-lg border border-border bg-card p-4 space-y-3 hover:border-primary/30 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge tone="info" className="text-[10px]">
                                  {lesson.lessonType}
                                </Badge>
                                <span className="text-sm font-bold text-foreground">
                                  {lesson.position}. {lesson.title}
                                </span>
                              </div>

                              {lesson.lessonType === 'ARTICLE' ? (
                                <Button
                                  size="sm"
                                  variant={selectedLessonId === lesson.id ? 'primary' : 'secondary'}
                                  onClick={() =>
                                    setSelectedLessonId(selectedLessonId === lesson.id ? null : lesson.id)
                                  }
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1" />
                                  <span>
                                    {selectedLessonId === lesson.id ? 'Close Article Editor' : 'Edit Article Content'}
                                  </span>
                                </Button>
                              ) : lesson.lessonType === 'VIDEO' ? (
                                <Button
                                  size="sm"
                                  variant={selectedLessonId === lesson.id ? 'primary' : 'secondary'}
                                  onClick={() =>
                                    setSelectedLessonId(selectedLessonId === lesson.id ? null : lesson.id)
                                  }
                                >
                                  <VideoIcon className="h-3.5 w-3.5 mr-1" />
                                  <span>
                                    {selectedLessonId === lesson.id ? 'Close Video Studio' : 'Manage Video & Code Sync'}
                                  </span>
                                </Button>
                              ) : lesson.lessonType === 'CODING' ? (
                                <Button
                                  size="sm"
                                  variant={selectedLessonId === lesson.id ? 'primary' : 'secondary'}
                                  onClick={() =>
                                    setSelectedLessonId(selectedLessonId === lesson.id ? null : lesson.id)
                                  }
                                >
                                  <Code2 className="h-3.5 w-3.5 mr-1" />
                                  <span>
                                    {selectedLessonId === lesson.id ? 'Close Coding Studio' : 'Configure Coding Exercise'}
                                  </span>
                                </Button>
                              ) : lesson.lessonType === 'PROJECT' ? (
                                <Button
                                  size="sm"
                                  variant={selectedLessonId === lesson.id ? 'primary' : 'secondary'}
                                  onClick={() =>
                                    setSelectedLessonId(selectedLessonId === lesson.id ? null : lesson.id)
                                  }
                                >
                                  <FolderGit2 className="h-3.5 w-3.5 mr-1" />
                                  <span>
                                    {selectedLessonId === lesson.id ? 'Close Project Studio' : 'Configure Project Requirements'}
                                  </span>
                                </Button>
                              ) : lesson.lessonType === 'QUIZ' ? (
                                <Button
                                  size="sm"
                                  variant={selectedLessonId === lesson.id ? 'primary' : 'secondary'}
                                  onClick={() =>
                                    setSelectedLessonId(selectedLessonId === lesson.id ? null : lesson.id)
                                  }
                                >
                                  <HelpCircle className="h-3.5 w-3.5 mr-1" />
                                  <span>
                                    {selectedLessonId === lesson.id ? 'Close Quiz Info' : 'Quiz Details (Roadmap)'}
                                  </span>
                                </Button>
                              ) : null}
                            </div>

                            {selectedLessonId === lesson.id && lesson.lessonType === 'ARTICLE' ? (
                              <div className="pt-3 border-t border-border">
                                <ArticleEditor
                                  courseId={courseData.id}
                                  lessonId={lesson.id}
                                  initialTitle={lesson.title}
                                  initialContent={lesson.description}
                                  onClose={() => setSelectedLessonId(null)}
                                />
                              </div>
                            ) : null}

                            {selectedLessonId === lesson.id && lesson.lessonType === 'VIDEO' ? (
                              <div className="pt-3 border-t border-border">
                                <InstructorVideoManagement lessonId={lesson.id} />
                              </div>
                            ) : null}

                            {selectedLessonId === lesson.id && lesson.lessonType === 'CODING' ? (
                              <div className="pt-3 border-t border-border">
                                <InstructorCodingLessonPanel
                                  courseId={courseData.id}
                                  lessonId={lesson.id}
                                  initialTitle={lesson.title}
                                  initialDescription={lesson.description}
                                  onClose={() => setSelectedLessonId(null)}
                                />
                              </div>
                            ) : null}

                            {selectedLessonId === lesson.id && lesson.lessonType === 'PROJECT' ? (
                              <div className="pt-3 border-t border-border">
                                <InstructorProjectLessonPanel
                                  courseId={courseData.id}
                                  lessonId={lesson.id}
                                  initialTitle={lesson.title}
                                  initialDescription={lesson.description}
                                  onClose={() => setSelectedLessonId(null)}
                                />
                              </div>
                            ) : null}

                            {selectedLessonId === lesson.id && lesson.lessonType === 'QUIZ' ? (
                              <div className="pt-3 border-t border-border">
                                <InstructorQuizLessonPanel
                                  courseId={courseData.id}
                                  lessonId={lesson.id}
                                  initialTitle={lesson.title}
                                  onClose={() => setSelectedLessonId(null)}
                                />
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        No lessons added to this module yet. Click &quot;Add Lesson&quot; above.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No modules created"
              description="Create your first module above to organize lessons."
              icon={<Layers className="h-8 w-8 text-muted-foreground" />}
            />
          )}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Course Information</CardTitle>
            <CardDescription>Overview of course metadata and status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Title</p>
              <p className="text-sm font-medium text-foreground">{courseData.title}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Description</p>
              <p className="text-sm text-foreground">{courseData.description}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Category</p>
                <p className="text-sm text-foreground">{courseData.category?.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Difficulty</p>
                <StatusBadge value={courseData.difficulty} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function InstructorVideoManagement({ lessonId }: { readonly lessonId: string }) {
  const [videoAssetId, setVideoAssetId] = useState<string | null>(null);
  const [currentVideoTimeSeconds, setCurrentVideoTimeSeconds] = useState(0);
  const [seekToSeconds, setSeekToSeconds] = useState<number | null>(null);

  const checkpoints = useQuery({
    queryKey: ['instructor-video-checkpoints', videoAssetId],
    enabled: Boolean(videoAssetId),
    queryFn: () =>
      requestJson<{ readonly checkpoints: readonly VideoCheckpoint[] }>(
        `/instructor/videos/${videoAssetId}/checkpoints`,
      ),
  });

  return (
    <div className="space-y-6">
      <VideoUploadStudio
        lessonId={lessonId}
        existingVideoAssetId={videoAssetId}
        onVideoReady={(id) => setVideoAssetId(id)}
        onTimeChange={(seconds) => setCurrentVideoTimeSeconds(seconds)}
        seekToSeconds={seekToSeconds}
      />

      {videoAssetId ? (
        <>
          <CodeAlongStudio
            lessonId={lessonId}
            videoAssetId={videoAssetId}
            currentVideoTimeSeconds={currentVideoTimeSeconds}
            onSeekToSeconds={(seconds) => {
              setSeekToSeconds(seconds);
              // reset after brief tick to allow re-seeking to same second if clicked again
              setTimeout(() => setSeekToSeconds(null), 100);
            }}
          />

          {checkpoints.data?.checkpoints
            .filter((checkpoint) => checkpoint.type === 'PROJECT')
            .map((checkpoint) => (
              <InstructorProjectCheckpointPanel key={checkpoint.id} checkpoint={checkpoint} />
            ))}
        </>
      ) : null}
    </div>
  );
}

function InstructorProjectCheckpointPanel({
  checkpoint,
}: {
  readonly checkpoint: VideoCheckpoint;
}) {
  const queryClient = useQueryClient();
  const [passScore, setPassScore] = useState('70');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [requireDeploymentUrl, setRequireDeploymentUrl] = useState(false);
  const [criterionTitle, setCriterionTitle] = useState('');
  const [criterionType, setCriterionType] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [autoCheckType, setAutoCheckType] = useState<ProjectRubricCriterion['autoCheckType']>('FILE_EXISTS');
  const [criterionPath, setCriterionPath] = useState('package.json');
  const [criterionWeight, setCriterionWeight] = useState('100');

  const config = useQuery({
    queryKey: ['project-config', checkpoint.id],
    queryFn: () => requestJson<ProjectCheckpointConfigResponse>(`/instructor/checkpoints/${checkpoint.id}/project`),
  });

  const submissions = useQuery({
    queryKey: ['instructor-project-submissions', checkpoint.id],
    queryFn: () =>
      requestJson<{
        readonly items: readonly {
          readonly id: string;
          readonly student: { readonly email: string; readonly displayName: string };
          readonly repositoryOwner: string;
          readonly repositoryName: string;
          readonly commitSha: string;
          readonly status: string;
          readonly score: number | null;
          readonly passed: boolean | null;
          readonly manualReviewPending: boolean;
          readonly submittedAt: string;
        }[];
      }>(`/instructor/checkpoints/${checkpoint.id}/project-submissions`),
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      requestJson<ProjectCheckpointConfigResponse>(`/instructor/checkpoints/${checkpoint.id}/project`, {
        method: 'PUT',
        body: JSON.stringify({
          defaultBranch: defaultBranch.trim() || null,
          requireDeploymentUrl,
          passScore: Number(passScore),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-config', checkpoint.id] }),
  });

  const addCriterion = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/checkpoints/${checkpoint.id}/project/rubric`, {
        method: 'POST',
        body: JSON.stringify({
          title: criterionTitle.trim(),
          type: criterionType,
          ...(criterionType === 'AUTO'
            ? {
                autoCheckType,
                config:
                  autoCheckType === 'FILE_EXISTS' || autoCheckType === 'JSON_FIELD'
                    ? { path: criterionPath }
                    : null,
              }
            : {}),
          weight: Number(criterionWeight),
          required: true,
        }),
      }),
    onSuccess: () => {
      setCriterionTitle('');
      void queryClient.invalidateQueries({ queryKey: ['project-config', checkpoint.id] });
    },
  });

  const manualGrade = useMutation({
    mutationFn: (submissionId: string) => {
      const manualCriteria = config.data?.criteria.filter((c) => c.type === 'MANUAL') ?? [];
      return requestJson(`/instructor/project-submissions/${submissionId}/manual-grade`, {
        method: 'POST',
        body: JSON.stringify({
          criteria: manualCriteria.map((c) => ({
            criterionId: c.id,
            score: c.weight,
            feedback: 'Approved by instructor.',
          })),
        }),
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['instructor-project-submissions', checkpoint.id] }),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">
          Project Grading & Rubric: {checkpoint.title}
        </h4>
        <span className="text-xs text-muted-foreground">
          {config.data?.criteria.length ?? 0} criteria
        </span>
      </div>

      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Default Branch"
            value={defaultBranch}
            onChange={(event) => setDefaultBranch(event.target.value)}
          />
          <Input
            placeholder="Pass Score (0-100)"
            value={passScore}
            onChange={(event) => setPassScore(event.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={() => saveConfig.mutate()}>
            Save Settings
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={requireDeploymentUrl}
            onChange={(event) => setRequireDeploymentUrl(event.target.checked)}
          />
          Require live deployment URL with submission
        </label>
      </div>

      {/* Add Rubric Criterion */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
        <h5 className="text-xs font-bold text-foreground">Add Rubric Criterion</h5>
        <Input
          placeholder="Criterion Title"
          value={criterionTitle}
          onChange={(event) => setCriterionTitle(event.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-4">
          <Select
            value={criterionType}
            onChange={(event) => setCriterionType(event.target.value as 'AUTO' | 'MANUAL')}
          >
            <option value="AUTO">Auto Check</option>
            <option value="MANUAL">Manual Grading</option>
          </Select>
          <Select
            value={autoCheckType ?? ''}
            onChange={(event) =>
              setAutoCheckType(event.target.value as ProjectRubricCriterion['autoCheckType'])
            }
          >
            <option value="FILE_EXISTS">File Exists</option>
            <option value="BUILD_SUCCESS">Build Success</option>
            <option value="TEST_SUCCESS">Test Success</option>
          </Select>
          <Input
            placeholder="Target Path"
            value={criterionPath}
            onChange={(event) => setCriterionPath(event.target.value)}
          />
          <Input
            placeholder="Weight"
            value={criterionWeight}
            onChange={(event) => setCriterionWeight(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          disabled={!criterionTitle.trim() || addCriterion.isPending}
          onClick={() => addCriterion.mutate()}
        >
          Add Criterion
        </Button>
      </div>

      {/* Submissions Review Queue */}
      <div className="space-y-2">
        <h5 className="text-xs font-bold text-foreground">Student Submissions Queue</h5>
        {submissions.data?.items && submissions.data.items.length > 0 ? (
          <div className="space-y-2">
            {submissions.data.items.map((sub) => (
              <div
                key={sub.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border border-border bg-card text-xs"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {sub.student.displayName || sub.student.email}
                  </p>
                  <p className="text-muted-foreground font-mono">
                    {sub.repositoryOwner}/{sub.repositoryName}@{sub.commitSha.slice(0, 10)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={sub.passed ? 'success' : 'warning'}>{sub.status}</Badge>
                  {sub.manualReviewPending ? (
                    <Button
                      size="sm"
                      isLoading={manualGrade.isPending}
                      onClick={() => manualGrade.mutate(sub.id)}
                    >
                      Approve Grade
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No submissions recorded for this checkpoint yet.</p>
        )}
      </div>
    </div>
  );
}

function InstructorCodingLessonPanel({
  courseId,
  lessonId,
  initialTitle,
  initialDescription,
  onClose,
}: {
  readonly courseId: string;
  readonly lessonId: string;
  readonly initialTitle: string;
  readonly initialDescription?: string | null | undefined;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [language, setLanguage] = useState('javascript');
  const [entryFile, setEntryFile] = useState('index.js');
  const [passScore, setPassScore] = useState(70);
  const [timeLimitMs, setTimeLimitMs] = useState(5000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(128);
  const [scoringMode, setScoringMode] = useState<'WEIGHTED' | 'ALL_OR_NOTHING'>('WEIGHTED');
  const [starterFiles, setStarterFiles] = useState<Array<{ path: string; content: string }>>([
    { path: 'index.js', content: 'function solution() {\n  // TODO: implement\n}\n\nmodule.exports = { solution };\n' },
  ]);
  const [testCases, setTestCases] = useState<
    Array<{ name: string; visibility: 'PUBLIC' | 'HIDDEN'; input: string; expectedOutput: string; weight: number }>
  >([
    { name: 'Sample Test Case', visibility: 'PUBLIC', input: '', expectedOutput: '', weight: 50 },
    { name: 'Hidden Verification Test', visibility: 'HIDDEN', input: '', expectedOutput: '', weight: 50 },
  ]);

  useQuery({
    queryKey: ['instructor-coding-config', lessonId],
    queryFn: async () => {
      const res = await requestJson<InstructorCodingConfigResponse>(`/instructor/lessons/${lessonId}/coding`);
      if (res.config) {
        setLanguage(res.config.language);
        setEntryFile(res.config.entryFile);
        setPassScore(res.config.passScore);
        setTimeLimitMs(res.config.timeLimitMs);
        setMemoryLimitMb(res.config.memoryLimitMb);
        setScoringMode(res.config.scoringMode);
        if (res.config.starterFiles && res.config.starterFiles.length > 0) {
          setStarterFiles(res.config.starterFiles.map((f) => ({ path: f.path, content: f.content })));
        }
        if (res.config.testCases && res.config.testCases.length > 0) {
          setTestCases(
            res.config.testCases.map((tc) => ({
              name: tc.name,
              visibility: tc.visibility,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              weight: tc.weight,
            })),
          );
        }
      }
      return res;
    },
  });

  const saveDetails = useMutation({
    mutationFn: async () => {
      await requestJson(`/instructor/lessons/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      });
      await requestJson(`/instructor/lessons/${lessonId}/coding`, {
        method: 'PUT',
        body: JSON.stringify({
          language,
          entryFile: entryFile.trim(),
          passScore: Number(passScore),
          timeLimitMs: Number(timeLimitMs),
          memoryLimitMb: Number(memoryLimitMb),
          scoringMode,
          starterFiles,
          testCases,
        }),
      });
    },
    onSuccess: async () => {
      toast.success('Coding exercise and test suites saved successfully');
      await queryClient.invalidateQueries({ queryKey: ['instructor-course', courseId] });
      await queryClient.invalidateQueries({ queryKey: ['instructor-coding-config', lessonId] });
    },
    onError: (err) => {
      toast.error('Failed to update coding exercise', err instanceof Error ? err.message : undefined);
    },
  });

  const handleAddStarterFile = () => {
    setStarterFiles((prev) => [...prev, { path: `file_${prev.length + 1}.js`, content: '' }]);
  };

  const handleRemoveStarterFile = (index: number) => {
    if (starterFiles.length <= 1) {
      toast.warning('At least one starter file is required');
      return;
    }
    setStarterFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddTestCase = (visibility: 'PUBLIC' | 'HIDDEN') => {
    setTestCases((prev) => [
      ...prev,
      {
        name: `${visibility === 'PUBLIC' ? 'Public' : 'Hidden'} Test #${prev.length + 1}`,
        visibility,
        input: '',
        expectedOutput: '',
        weight: 10,
      },
    ]);
  };

  const handleRemoveTestCase = (index: number) => {
    setTestCases((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className="border-primary/30 p-5 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            <span>Coding Exercise Authoring Studio</span>
          </h4>
          <p className="text-xs text-muted-foreground">
            Configure challenge statement, sandbox execution constraints, starter files, and grading test suites.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            isLoading={saveDetails.isPending}
            disabled={!title.trim() || saveDetails.isPending}
            onClick={() => saveDetails.mutate()}
          >
            Save Exercise & Tests
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Basic Exercise Info */}
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
              Exercise Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Validate a Username"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
              Task Description & Guidelines (Markdown supported)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide clear rules, constraints, examples, and expected return format..."
              className="w-full min-h-[140px] rounded-lg border border-border bg-background p-3 text-xs font-mono text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Runtime & Sandbox Limits */}
        <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3">
          <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Execution Sandbox & Evaluation Configuration
          </h5>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Language
              </label>
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="javascript">JavaScript (Node.js)</option>
                <option value="typescript">TypeScript</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Entry File
              </label>
              <Input
                value={entryFile}
                onChange={(e) => setEntryFile(e.target.value)}
                placeholder="index.js"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Pass Score (0 - 100)
              </label>
              <Input
                type="number"
                value={passScore}
                onChange={(e) => setPassScore(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Scoring Mode
              </label>
              <Select
                value={scoringMode}
                onChange={(e) => setScoringMode(e.target.value as 'WEIGHTED' | 'ALL_OR_NOTHING')}
              >
                <option value="WEIGHTED">Weighted by Test Weights</option>
                <option value="ALL_OR_NOTHING">All or Nothing</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Time Limit (ms)
              </label>
              <Input
                type="number"
                value={timeLimitMs}
                onChange={(e) => setTimeLimitMs(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Memory Limit (MB)
              </label>
              <Input
                type="number"
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Starter Workspace Files */}
        <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Starter Workspace Files
            </h5>
            <Button size="sm" variant="secondary" onClick={handleAddStarterFile} className="text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add File
            </Button>
          </div>
          <div className="space-y-3">
            {starterFiles.map((file, fIdx) => (
              <div key={fIdx} className="rounded-md border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={file.path}
                    onChange={(e) => {
                      const newPath = e.target.value;
                      setStarterFiles((prev) =>
                        prev.map((item, idx) => (idx === fIdx ? { ...item, path: newPath } : item)),
                      );
                    }}
                    placeholder="File path (e.g. index.js)"
                    className="max-w-xs font-mono text-xs"
                  />
                  {starterFiles.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveStarterFile(fIdx)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <textarea
                  value={file.content}
                  onChange={(e) => {
                    const newContent = e.target.value;
                    setStarterFiles((prev) =>
                      prev.map((item, idx) => (idx === fIdx ? { ...item, content: newContent } : item)),
                    );
                  }}
                  placeholder="Starter template code for student workspace..."
                  className="w-full min-h-[90px] rounded border border-border bg-muted/40 p-2.5 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Test Cases */}
        <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Judge Automated Test Cases ({testCases.length})
              </h5>
              <p className="text-[11px] text-muted-foreground">
                Public tests provide feedback on student runs. Hidden tests are kept confidential to grade solutions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleAddTestCase('PUBLIC')} className="text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Public Test
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleAddTestCase('HIDDEN')} className="text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Hidden Test
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {testCases.map((tc, tcIdx) => (
              <div key={tcIdx} className="rounded-md border border-border bg-card p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Badge tone={tc.visibility === 'PUBLIC' ? 'info' : 'warning'} className="text-[10px]">
                      {tc.visibility}
                    </Badge>
                    <Input
                      value={tc.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setTestCases((prev) =>
                          prev.map((item, idx) => (idx === tcIdx ? { ...item, name: newName } : item)),
                        );
                      }}
                      placeholder="Test case name"
                      className="text-xs font-semibold"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Weight:</span>
                      <Input
                        type="number"
                        value={tc.weight}
                        onChange={(e) => {
                          const newWeight = Number(e.target.value);
                          setTestCases((prev) =>
                            prev.map((item, idx) => (idx === tcIdx ? { ...item, weight: newWeight } : item)),
                          );
                        }}
                        className="w-16 text-xs"
                      />
                    </div>

                    <Select
                      value={tc.visibility}
                      onChange={(e) => {
                        const newVis = e.target.value as 'PUBLIC' | 'HIDDEN';
                        setTestCases((prev) =>
                          prev.map((item, idx) => (idx === tcIdx ? { ...item, visibility: newVis } : item)),
                        );
                      }}
                      className="text-xs"
                    >
                      <option value="PUBLIC">PUBLIC</option>
                      <option value="HIDDEN">HIDDEN</option>
                    </Select>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveTestCase(tcIdx)}
                      className="text-destructive hover:text-destructive p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Input (stdin)
                    </label>
                    <textarea
                      value={tc.input}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTestCases((prev) =>
                          prev.map((item, idx) => (idx === tcIdx ? { ...item, input: val } : item)),
                        );
                      }}
                      placeholder="Input passed to stdin..."
                      className="w-full min-h-[60px] rounded border border-border bg-muted/40 p-2 text-xs font-mono text-foreground focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Expected Output (stdout)
                    </label>
                    <textarea
                      value={tc.expectedOutput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTestCases((prev) =>
                          prev.map((item, idx) => (idx === tcIdx ? { ...item, expectedOutput: val } : item)),
                        );
                      }}
                      placeholder="Expected output match..."
                      className="w-full min-h-[60px] rounded border border-border bg-muted/40 p-2 text-xs font-mono text-foreground focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function InstructorProjectLessonPanel({
  courseId,
  lessonId,
  initialTitle,
  initialDescription,
  onClose,
}: {
  readonly courseId: string;
  readonly lessonId: string;
  readonly initialTitle: string;
  readonly initialDescription?: string | null | undefined;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? '');

  const saveDetails = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/lessons/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      }),
    onSuccess: async () => {
      toast.success('Project requirements updated successfully');
      await queryClient.invalidateQueries({ queryKey: ['instructor-course', courseId] });
    },
    onError: (err) => {
      toast.error('Failed to update project lesson', err instanceof Error ? err.message : undefined);
    },
  });

  return (
    <Card className="border-primary/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-foreground">Capstone Project Studio</h4>
          <p className="text-xs text-muted-foreground">
            Define project specifications, acceptance criteria, and repository submission guidelines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            isLoading={saveDetails.isPending}
            disabled={!title.trim() || saveDetails.isPending}
            onClick={() => saveDetails.mutate()}
          >
            Save Project
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
            Project Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Project title"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
            Project Specification & Rubric Overview
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Specify repository structure, mandatory files, commit criteria, and evaluation rules..."
            className="w-full min-h-[140px] rounded-lg border border-border bg-background p-3 text-xs font-mono text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
    </Card>
  );
}

function InstructorQuizLessonPanel({
  courseId,
  lessonId,
  initialTitle,
  onClose,
}: {
  readonly courseId: string;
  readonly lessonId: string;
  readonly initialTitle: string;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [instructions, setInstructions] = useState('');
  const [passScore, setPassScore] = useState(70);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [showResultImmediately, setShowResultImmediately] = useState(true);
  const [newQuestionType, setNewQuestionType] = useState<'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'>('SINGLE_CHOICE');
  const [newQuestionPrompt, setNewQuestionPrompt] = useState('');

  const quiz = useQuery({
    queryKey: ['instructor', 'quiz', lessonId],
    queryFn: () => requestJson<{ readonly quiz: InstructorQuiz | null }>(`/instructor/lessons/${lessonId}/quiz`),
  });

  const currentQuiz = quiz.data?.quiz ?? null;

  useEffect(() => {
    if (!currentQuiz) {
      return;
    }

    setTitle(currentQuiz.title);
    setInstructions(currentQuiz.instructions ?? '');
    setPassScore(currentQuiz.passScore);
    setShuffleQuestions(currentQuiz.shuffleQuestions);
    setShuffleOptions(currentQuiz.shuffleOptions);
    setShowResultImmediately(currentQuiz.showResultImmediately);
  }, [currentQuiz]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      await requestJson(`/instructor/lessons/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: title.trim() }),
      });
      return requestJson<{ readonly quiz: InstructorQuiz }>(`/instructor/lessons/${lessonId}/quiz`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim(),
          instructions: instructions.trim() || null,
          passScore,
          shuffleQuestions,
          shuffleOptions,
          showResultImmediately,
        }),
      });
    },
    onSuccess: async () => {
      toast.success('Quiz lesson updated');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instructor-course', courseId] }),
        queryClient.invalidateQueries({ queryKey: ['instructor', 'quiz', lessonId] }),
      ]);
    },
    onError: (err) => {
      toast.error('Failed to update quiz lesson', err instanceof Error ? err.message : undefined);
    },
  });

  const addQuestion = useMutation({
    mutationFn: async () => {
      const quizId = currentQuiz?.id;
      if (!quizId) {
        throw new Error('Save quiz settings before adding questions');
      }

      return requestJson(`/instructor/quizzes/${quizId}/questions`, {
        method: 'POST',
        body: JSON.stringify({
          type: newQuestionType,
          prompt: newQuestionPrompt.trim(),
          points: 1,
          options: newQuestionType === 'SINGLE_CHOICE'
            ? [
                { text: 'Option A', isCorrect: true },
                { text: 'Option B', isCorrect: false },
              ]
            : [
                { text: 'Option A', isCorrect: true },
                { text: 'Option B', isCorrect: false },
                { text: 'Option C', isCorrect: true },
              ],
        }),
      });
    },
    onSuccess: async () => {
      setNewQuestionPrompt('');
      await queryClient.invalidateQueries({ queryKey: ['instructor', 'quiz', lessonId] });
    },
    onError: (err) => toast.error('Failed to add question', err instanceof Error ? err.message : undefined),
  });

  const reorderQuestions = useMutation({
    mutationFn: (orderedIds: readonly string[]) =>
      requestJson(`/instructor/quizzes/${currentQuiz?.id}/questions/reorder`, {
        method: 'POST',
        body: JSON.stringify({ orderedIds }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['instructor', 'quiz', lessonId] });
    },
  });

  function moveQuestion(questionId: string, direction: -1 | 1) {
    const questions = currentQuiz?.questions ?? [];
    const index = questions.findIndex((question) => question.id === questionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= questions.length) return;
    const ordered = [...questions];
    const [item] = ordered.splice(index, 1);
    if (!item) return;
    ordered.splice(target, 0, item);
    reorderQuestions.mutate(ordered.map((question) => question.id));
  }

  return (
    <Card className="border-primary/20 bg-card p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-foreground">Quiz Settings</h4>
          <p className="text-xs text-muted-foreground">Configure questions, passing score, and result disclosure.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            isLoading={saveSettings.isPending}
            disabled={!title.trim() || saveSettings.isPending}
            onClick={() => saveSettings.mutate()}
          >
            Save Quiz
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Quiz Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz title" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Passing Score</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={passScore}
            onChange={(e) => setPassScore(Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Instructions</label>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-hidden focus:ring-2 focus:ring-ring"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Instructions shown to students before they start the quiz."
        />
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} />
          Shuffle questions
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={shuffleOptions} onChange={(event) => setShuffleOptions(event.target.checked)} />
          Shuffle options
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={showResultImmediately} onChange={(event) => setShowResultImmediately(event.target.checked)} />
          Show result immediately
        </label>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-semibold text-foreground">Questions</h5>
          <Badge tone={currentQuiz && currentQuiz.questions.length > 0 ? 'success' : 'warning'}>
            {currentQuiz?.questions.length ?? 0}
          </Badge>
        </div>

        {quiz.isLoading ? <PageSkeleton /> : null}

        <div className="space-y-3">
          {currentQuiz?.questions.map((question, index) => (
            <InstructorQuizQuestionEditor
              key={question.id}
              quizId={currentQuiz.id}
              lessonId={lessonId}
              question={question}
              index={index}
              canMoveUp={index > 0}
              canMoveDown={index < currentQuiz.questions.length - 1}
              onMove={moveQuestion}
            />
          ))}
        </div>

        <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto]">
            <Select value={newQuestionType} onChange={(e) => setNewQuestionType(e.target.value as 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE')}>
              <option value="SINGLE_CHOICE">Single choice</option>
              <option value="MULTIPLE_CHOICE">Multiple choice</option>
            </Select>
            <Input
              value={newQuestionPrompt}
              onChange={(e) => setNewQuestionPrompt(e.target.value)}
              placeholder="Question prompt"
            />
            <Button
              size="sm"
              onClick={() => addQuestion.mutate()}
              disabled={!newQuestionPrompt.trim() || !currentQuiz}
              isLoading={addQuestion.isPending}
            >
              Add Question
            </Button>
          </div>
          {!currentQuiz ? (
            <p className="text-xs text-muted-foreground">Save quiz settings before adding questions.</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function InstructorQuizQuestionEditor({
  quizId,
  lessonId,
  question,
  index,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  readonly quizId: string;
  readonly lessonId: string;
  readonly question: InstructorQuizQuestion;
  readonly index: number;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onMove: (questionId: string, direction: -1 | 1) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState(question.type);
  const [prompt, setPrompt] = useState(question.prompt);
  const [points, setPoints] = useState(question.points);
  const [explanation, setExplanation] = useState(question.explanation ?? '');
  const [options, setOptions] = useState(question.options.map((option) => ({ ...option })));

  const saveQuestion = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/quizzes/${quizId}/questions/${question.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          type,
          prompt: prompt.trim(),
          points,
          explanation: explanation.trim() || null,
          options: options.map((option, optionIndex) => ({
            text: option.text,
            isCorrect: option.isCorrect,
            position: optionIndex + 1,
          })),
        }),
      }),
    onSuccess: async () => {
      toast.success('Question saved');
      await queryClient.invalidateQueries({ queryKey: ['instructor', 'quiz', lessonId] });
    },
    onError: (err) => toast.error('Failed to save question', err instanceof Error ? err.message : undefined),
  });

  const deleteQuestion = useMutation({
    mutationFn: () => requestJson(`/instructor/quizzes/${quizId}/questions/${question.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['instructor', 'quiz', lessonId] });
    },
    onError: (err) => toast.error('Failed to delete question', err instanceof Error ? err.message : undefined),
  });

  function setCorrect(optionIndex: number, checked: boolean) {
    setOptions((current) =>
      current.map((option, index) => ({
        ...option,
        isCorrect: type === 'SINGLE_CHOICE' ? index === optionIndex && checked : index === optionIndex ? checked : option.isCorrect,
      })),
    );
  }

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Question {index + 1}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" disabled={!canMoveUp} onClick={() => onMove(question.id, -1)}>Up</Button>
          <Button size="sm" variant="secondary" disabled={!canMoveDown} onClick={() => onMove(question.id, 1)}>Down</Button>
          <Button size="sm" variant="danger" onClick={() => deleteQuestion.mutate()} isLoading={deleteQuestion.isPending}>
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[170px_100px_minmax(0,1fr)]">
        <Select value={type} onChange={(e) => setType(e.target.value as 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE')}>
          <option value="SINGLE_CHOICE">Single choice</option>
          <option value="MULTIPLE_CHOICE">Multiple choice</option>
        </Select>
        <Input type="number" min={1} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Question prompt" />
      </div>

      <div className="space-y-2">
        {options.map((option, optionIndex) => (
          <div key={option.id ?? optionIndex} className="grid gap-2 md:grid-cols-[24px_minmax(0,1fr)_auto]">
            <Checkbox checked={option.isCorrect} onChange={(event) => setCorrect(optionIndex, event.target.checked)} />
            <Input
              value={option.text}
              onChange={(e) => {
                const text = e.target.value;
                setOptions((current) => current.map((item, index) => index === optionIndex ? { ...item, text } : item));
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={options.length <= 2}
              onClick={() => setOptions((current) => current.filter((_option, index) => index !== optionIndex))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOptions((current) => [...current, { id: `new-${Date.now()}`, text: '', isCorrect: false, position: current.length + 1 }])}
        >
          Add Option
        </Button>
      </div>

      <textarea
        className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-hidden focus:ring-2 focus:ring-ring"
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="Explanation shown after submission"
      />

      <Button size="sm" onClick={() => saveQuestion.mutate()} isLoading={saveQuestion.isPending} disabled={!prompt.trim()}>
        Save Question
      </Button>
    </div>
  );
}
