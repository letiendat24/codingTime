'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Search, Archive } from 'lucide-react';
import { type AdminCourseSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, FilterForm, SelectInput, StatusBadge, TextInput, formatDate } from '../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
import { Button } from '../../../design-system/components/button';
import { LoadingState } from '../../../design-system/components/loading-state';

export default function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(difficulty ? { difficulty } : {}),
  }).toString();

  const courses = useQuery({
    queryKey: ['admin-courses', query],
    queryFn: () => requestJson<PaginatedResponse<AdminCourseSummary>>(`/admin/courses?${query}`),
    retry: false,
  });

  const archive = useMutation({
    mutationFn: (courseId: string) =>
      requestJson(`/admin/courses/${courseId}/archive`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'admin course oversight action' }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-courses'] }),
  });

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
  }

  if (courses.isError) return <AdminError message={courses.error instanceof Error ? courses.error.message : undefined} />;

  return (
    <div className="space-y-6">
      <FilterForm onSubmit={applyFilters}>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <TextInput
            placeholder="Search title or slug..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </SelectInput>
        <SelectInput value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
          <option value="">All Difficulties</option>
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
        </SelectInput>
      </FilterForm>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Platform Course Catalog</CardTitle>
              <CardDescription>Oversight of all curriculum content, status, and enrollment reach.</CardDescription>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              Total: {courses.data?.pagination.total ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {courses.isLoading ? (
            <div className="py-12">
              <LoadingState message="Loading courses..." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3.5">Course</th>
                    <th className="px-6 py-3.5">Instructor</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Difficulty</th>
                    <th className="px-6 py-3.5">Enrollments</th>
                    <th className="px-6 py-3.5">Created At</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(courses.data?.items ?? []).map((course) => (
                    <tr key={course.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4 font-medium">
                        <Link
                          className="text-foreground hover:text-primary transition-colors"
                          href={`/admin/courses/${course.id}`}
                        >
                          {course.title}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">{course.instructor.email}</td>
                      <td className="px-6 py-4">
                        <StatusBadge value={course.status} />
                      </td>
                      <td className="px-6 py-4 text-xs font-medium">{course.difficulty}</td>
                      <td className="px-6 py-4 font-semibold">{course.enrollmentCount}</td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">{formatDate(course.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        {course.status !== 'ARCHIVED' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => archive.mutate(course.id)}
                            isLoading={archive.isPending && archive.variables === course.id}
                            leftIcon={<Archive className="h-3.5 w-3.5" />}
                          >
                            Archive
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {(courses.data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-sm text-muted-foreground">
                        No courses found matching filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
