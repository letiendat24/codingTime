'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { requestJson } from '../../../../lib/api';

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const categories = useQuery({
    queryKey: ['course-categories'],
    queryFn: () => requestJson<CategoryResponse>('/courses/categories'),
  });
  const createCourse = useMutation({
    mutationFn: () =>
      requestJson<CreateCourseResponse>('/instructor/courses', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          difficulty: 'BEGINNER',
          categoryId,
          tags: [],
        }),
      }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createCourse.mutate();
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <h1 className="mb-8 text-3xl font-semibold">New Course</h1>
      <form className="space-y-4" onSubmit={onSubmit}>
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          placeholder="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <textarea
          className="min-h-32 w-full rounded-md border bg-background px-3 py-2"
          placeholder="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <select
          className="w-full rounded-md border bg-background px-3 py-2"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Category</option>
          {categories.data?.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" type="submit">
          Create
        </button>
      </form>
      {createCourse.isSuccess ? (
        <p className="mt-4 text-sm text-muted-foreground">Created {createCourse.data.course.id}</p>
      ) : null}
      {createCourse.isError ? <p className="mt-4 text-sm text-red-600">{createCourse.error.message}</p> : null}
    </main>
  );
}
