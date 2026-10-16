'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CommunityModeration } from '@/components/courses/community-moderation';
import { LoadingScreen } from '@/components/loading-screen';

function CommentsScreen() {
  const lessonId = useSearchParams().get('lessonId');
  return <CommunityModeration lessonId={lessonId} />;
}

export default function CommentsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CommentsScreen />
    </Suspense>
  );
}
