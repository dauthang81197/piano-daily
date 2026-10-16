import type { ReactNode } from 'react';
import { CourseProgressProvider } from '@/components/courses/course-progress';

/** Giữ tiến độ học dùng chung cho thẻ nhánh, trang nhánh và trang bài (đánh dấu ở trang bài, quay lại thấy ngay). */
export default function CoursesLayout({ children }: { children: ReactNode }) {
  return <CourseProgressProvider>{children}</CourseProgressProvider>;
}
