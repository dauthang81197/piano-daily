'use client';

import { use } from 'react';
import { MusicEditorPage } from '@/components/courses/music-editor/music-editor-page';

export default function LessonMusicPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = use(params);
  return <MusicEditorPage trackId={id} lessonId={lessonId} />;
}
