'use client';

import { use } from 'react';
import { LessonSubmissionsPage } from '@/components/courses/lesson-submissions';

export default function LessonSubmissionsRoute({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = use(params);
  return <LessonSubmissionsPage trackId={id} lessonId={lessonId} />;
}
