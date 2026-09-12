'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, PageSkeleton, Select, Textarea } from '../../../../design-system';
import { useAuthGuard } from '../../../../features/auth/hooks/use-auth-guard';
import { requestJson } from '../../../../lib/api';
import { useI18n } from '../../../../providers/i18n-provider';

interface CategoryResponse {
  readonly categories: readonly {
    readonly id: string;
    readonly name: string;
  }[];
}

interface CreateCourseResponse {
  readonly course: {
    readonly id: string;
  };
}

export default function NewInstructorCoursePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { isLoading: authLoading } = useAuthGuard({ requiredRole: 'INSTRUCTOR' });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('BEGINNER');
  const [categoryId, setCategoryId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ['course-categories'],
    queryFn: () => requestJson<CategoryResponse>('/courses/categories'),
  });

  const createCourse = useMutation({
    mutationFn: () => {
      setErrorMessage(null);
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

      return requestJson<CreateCourseResponse>('/instructor/courses', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          difficulty,
          categoryId: categoryId || categories.data?.categories[0]?.id,
          tags,
        }),
      });
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
      router.push(`/instructor/courses/${data.course.id}`);
    },
    onError: (error: Error) => {
      setErrorMessage(error.message || t('common.error'));
    },
  });

  if (authLoading || categories.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        <PageSkeleton />
      </main>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;
    createCourse.mutate();
  }

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/instructor/courses"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('instructor.courses')}</span>
        </Link>
      </div>

      <Card className="shadow-md border-border">
        <CardHeader>
          <CardTitle className="text-xl font-bold">{t('instructor.createCourse')}</CardTitle>
          <CardDescription>
            Fill in the course basic information. You will be able to build modules, upload video lessons, and author code snapshots next.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <form className="space-y-4" onSubmit={onSubmit}>
            {errorMessage ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Course Title</label>
              <Input
                required
                placeholder="e.g. Modern Fullstack Next.js & TypeScript"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Description</label>
              <Textarea
                required
                rows={4}
                placeholder="Comprehensive overview of topics covered and target audience..."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Category</label>
                <Select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Select Category</option>
                  {categories.data?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Difficulty</label>
                <Select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                >
                  <option value="BEGINNER">Beginner</option>
                  <option value="INTERMEDIATE">Intermediate</option>
                  <option value="ADVANCED">Advanced</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tags (comma-separated)</label>
              <Input
                placeholder="react, typescript, nextjs, backend"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Link href="/instructor/courses">
                <Button variant="secondary" type="button">
                  {t('common.cancel')}
                </Button>
              </Link>
              <Button
                type="submit"
                isLoading={createCourse.isPending}
                disabled={createCourse.isPending || !title.trim() || !description.trim()}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                <span>Create & Build Curriculum</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
