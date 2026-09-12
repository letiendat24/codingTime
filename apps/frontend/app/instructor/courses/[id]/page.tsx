'use client';

import { useState } from 'react';
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

  const saveDetails = useMutation({
    mutationFn: async () => {
      await requestJson(`/instructor/lessons/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      });
      // Optionally update code-along settings if configured
      await requestJson(`/instructor/lessons/${lessonId}/code-along`, {
        method: 'PUT',
        body: JSON.stringify({
          language,
          entryFile,
        }),
      }).catch(() => {
        // Silently continue if code-along config is not present for non-video coding lesson
      });
    },
    onSuccess: async () => {
      toast.success('Coding exercise updated successfully');
      await queryClient.invalidateQueries({ queryKey: ['instructor-course', courseId] });
    },
    onError: (err) => {
      toast.error('Failed to update coding exercise', err instanceof Error ? err.message : undefined);
    },
  });

  return (
    <Card className="border-primary/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-foreground">Coding Exercise Studio</h4>
          <p className="text-xs text-muted-foreground">
            Configure the coding task statement, instructions, and workspace environment for learners.
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
            Save Exercise
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
            Lesson Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Exercise title"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
            Task Description & Instructions
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the coding challenge, requirements, input/output specifications, and constraints..."
            className="w-full min-h-[140px] rounded-lg border border-border bg-background p-3 text-xs font-mono text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
              Programming Language
            </label>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="javascript">JavaScript (Node.js)</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
              Entry File
            </label>
            <Input
              value={entryFile}
              onChange={(e) => setEntryFile(e.target.value)}
              placeholder="e.g. index.js, main.py"
            />
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

  const saveDetails = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/lessons/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
        }),
      }),
    onSuccess: async () => {
      toast.success('Quiz lesson updated');
      await queryClient.invalidateQueries({ queryKey: ['instructor-course', courseId] });
    },
    onError: (err) => {
      toast.error('Failed to update quiz lesson', err instanceof Error ? err.message : undefined);
    },
  });

  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-foreground">Quiz Lesson (Roadmap)</h4>
          <p className="text-xs text-muted-foreground">
            Interactive multiple-choice quizzes are part of the upcoming assessment milestone.
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
            Save Title
          </Button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
          Lesson Title
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quiz title"
        />
      </div>
    </Card>
  );
}
