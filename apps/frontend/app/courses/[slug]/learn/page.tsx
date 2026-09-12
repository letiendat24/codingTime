'use client';

import { Suspense } from 'react';
import { PageSkeleton } from '../../../../design-system';
import { LearnScreen } from '../../../../features/learning/components/learn-screen';

export default function CourseLearnPage() {
  return (
    <Suspense fallback={<main className="p-6"><PageSkeleton /></main>}>
      <LearnScreen />
    </Suspense>
  );
}
