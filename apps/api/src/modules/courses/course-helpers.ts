import { HttpStatus } from '@nestjs/common';
import { ErrorCode, LESSON_NEEDS_CONTENT_ERROR } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { notFound } from '../catalog/catalog.helpers';

/** Một bài chỉ công khai khi chính nó và cả ba cấp cha đều `is_published` (dùng cho mọi truy vấn công khai). */
export const VISIBLE_LESSON = {
  isPublished: true,
  section: { isPublished: true, level: { isPublished: true, track: { isPublished: true } } },
} as const;

/** Thứ tự ổn định trong cùng cha: `sort_order`, rồi thời điểm tạo, rồi id (khi trùng). */
export const ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];

export const TRACK_NOT_FOUND = 'Không tìm thấy nhánh.';
export const LEVEL_NOT_FOUND = 'Không tìm thấy level.';
export const SECTION_NOT_FOUND = 'Không tìm thấy section.';
export const LESSON_NOT_FOUND = 'Không tìm thấy bài học.';

export const trackMissing = () => notFound(TRACK_NOT_FOUND);

/** Bài đang công khai phải có ít nhất một trong video, nhạc, nội dung (cũng được DB ràng buộc). */
export function assertLessonHasPart(part: { isPublished: boolean; youtubeUrl: string | null; content: string; hasMidi: boolean }): void {
  if (part.isPublished && !part.youtubeUrl && !part.content.trim() && !part.hasMidi) {
    throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
      { path: 'content', message: LESSON_NEEDS_CONTENT_ERROR },
    ]);
  }
}
