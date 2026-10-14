'use client';

import { TrackList } from '@/components/courses/track-list';

export default function CoursesPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Khoá học</h1>
        <p className="text-body-md text-muted-foreground">
          Soạn lộ trình học: nhánh → level → section → bài học. Mỗi bài có thể có video YouTube, nhạc (file MIDI, người học sẽ thấy tay đánh phím) và nội dung. Chỉ phần được công khai ở mọi cấp mới hiện trên web.
        </p>
      </div>
      <TrackList />
    </section>
  );
}
