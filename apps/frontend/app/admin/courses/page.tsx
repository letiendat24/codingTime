'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { type AdminCourseSummary, type PaginatedResponse, requestJson } from '../../../lib/api';
import { AdminError, FilterForm, SelectInput, StatusBadge, TextInput, formatDate } from '../admin-components';

export default function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [query, setQuery] = useState('page=1&limit=20');
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
    const params = new URLSearchParams({ page: '1', limit: '20' });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (difficulty) params.set('difficulty', difficulty);
    setQuery(params.toString());
  }

  if (courses.isError) return <AdminError />;

  return (
    <section>
      <h2 className="text-xl font-semibold">Courses</h2>
      <FilterForm onSubmit={applyFilters}>
        <TextInput placeholder="Search title or slug" value={search} onChange={(event) => setSearch(event.target.value)} />
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </SelectInput>
        <SelectInput value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
          <option value="">Any difficulty</option>
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
        </SelectInput>
      </FilterForm>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Course</th>
              <th className="p-3">Instructor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Difficulty</th>
              <th className="p-3">Enrollments</th>
              <th className="p-3">Created</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(courses.data?.items ?? []).map((course) => (
              <tr key={course.id} className="border-t">
                <td className="p-3"><Link className="text-primary" href={`/admin/courses/${course.id}`}>{course.title}</Link></td>
                <td className="p-3">{course.instructor.email}</td>
                <td className="p-3"><StatusBadge value={course.status} /></td>
                <td className="p-3">{course.difficulty}</td>
                <td className="p-3">{course.enrollmentCount}</td>
                <td className="p-3">{formatDate(course.createdAt)}</td>
                <td className="p-3">
                  {course.status !== 'ARCHIVED' ? (
                    <button className="rounded-md border px-2 py-1" onClick={() => archive.mutate(course.id)}>
                      Archive
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
