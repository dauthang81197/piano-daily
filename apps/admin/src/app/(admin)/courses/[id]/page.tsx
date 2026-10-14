'use client';

import { use } from 'react';
import { CourseTreeEditor } from '@/components/courses/course-tree-editor';

export default function CourseTrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-headline-md text-primary">Soạn nhánh khoá học</h1>
      <CourseTreeEditor trackId={id} />
    </section>
  );
}
