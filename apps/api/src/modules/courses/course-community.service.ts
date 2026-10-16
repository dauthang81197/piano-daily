import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AdminComment,
  type AdminCommentPage,
  COMMENT_PAGE_SIZE,
  type CreateCommentBody,
  ErrorCode,
  type MyComment,
  type MyCommunity,
  type MyRating,
  type PublicCommunity,
  type PublicThread,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { inUse, notFound } from '../catalog/catalog.helpers';
import { CourseAccessService } from './course-access.service';
import { LESSON_NOT_FOUND, VISIBLE_LESSON } from './course-helpers';

const COMMENT_NOT_FOUND = 'Không tìm thấy bình luận.';
const DUPLICATE = 'Bạn đã đăng bình luận giống hệt này.';
/** Tối đa số trả lời nạp cho một trang bình luận gốc (chặn nhánh trả lời quá dài làm phản hồi phình). */
const REPLIES_CAP = 500;

type Author = { name: string };
type CommentRow = { id: string; parentId: string | null; body: string; createdAt: Date; editedAt: Date | null; customer: Author };
const base = (r: CommentRow) => ({
  id: r.id,
  parentId: r.parentId,
  body: r.body,
  authorName: r.customer.name,
  createdAt: r.createdAt.toISOString(),
  edited: r.editedAt !== null,
});

/**
 * Con trỏ chỉ chứa `id` (uuidv7 do DB sinh nên tăng theo thời gian): so sánh theo một cột duy nhất nên không mất/trùng dòng
 * như khi so `created_at` (µs ở DB, chỉ ms ở JS). Thứ tự hiển thị cũng theo `id` giảm dần.
 */
const encodeCursor = (id: string) => Buffer.from(id).toString('base64url');
function decodeCursor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  const id = cursor.length <= 100 ? Buffer.from(cursor, 'base64url').toString() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [{ path: 'cursor', message: 'Con trỏ không hợp lệ.' }]);
  }
  return id.toLowerCase();
}
const beforeCursor = (id: string | null) => (id ? { id: { lt: id } } : {});

/** Đánh giá + bình luận bài học (C4) và kiểm duyệt của admin. Kiểm duyệt sau: đăng ngay, admin ẩn/xoá. */
@Injectable()
export class CourseCommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  private async assertVisible(lessonId: string): Promise<void> {
    const lesson = await this.prisma.courseLesson.findFirst({ where: { id: lessonId, ...VISIBLE_LESSON }, select: { id: true } });
    if (!lesson) throw notFound(LESSON_NOT_FOUND);
  }

  /** Ghi cần tài khoản còn hoạt động và đã xác minh email (chống tài khoản ảo spam). */
  private async requirePosting(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { isActive: true, emailVerifiedAt: true } });
    if (!customer?.isActive) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    if (!customer.emailVerifiedAt) throw new AppException(ErrorCode.EMAIL_NOT_VERIFIED, HttpStatus.FORBIDDEN);
  }

  /** Lỗi khoá ngoại: khách đã bị xoá (token còn hạn) → 401; còn lại (bài/bình luận gốc bị xoá giữa chừng) → 404. */
  private async fkError(customerId: string, message: string): Promise<AppException> {
    if (!(await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) {
      return new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    return notFound(message);
  }

  private async ratingSummary(lessonId: string): Promise<PublicCommunity['rating']> {
    const agg = await this.prisma.courseRating.aggregate({ where: { lessonId }, _avg: { stars: true }, _count: { _all: true } });
    return { average: agg._avg.stars === null ? null : Math.round(agg._avg.stars * 10) / 10, count: agg._count._all };
  }

  // ── đọc ────────────────────────────────────────────────────

  async publicView(lessonId: string, cursorRaw: string | undefined): Promise<PublicCommunity> {
    await this.assertVisible(lessonId);
    const cursor = decodeCursor(cursorRaw);
    const roots = await this.prisma.courseComment.findMany({
      where: { lessonId, parentId: null, isHidden: false, ...beforeCursor(cursor) },
      orderBy: { id: 'desc' },
      take: COMMENT_PAGE_SIZE + 1,
      include: { customer: { select: { name: true } } },
    });
    const page = roots.slice(0, COMMENT_PAGE_SIZE);
    const replies = page.length
      ? await this.prisma.courseComment.findMany({
          where: { parentId: { in: page.map((r) => r.id) }, isHidden: false },
          orderBy: { id: 'asc' },
          take: REPLIES_CAP,
          include: { customer: { select: { name: true } } },
        })
      : [];
    const byParent = new Map<string, CommentRow[]>();
    for (const reply of replies) byParent.set(reply.parentId!, [...(byParent.get(reply.parentId!) ?? []), reply]);
    const last = page[page.length - 1];
    return {
      rating: await this.ratingSummary(lessonId),
      comments: page.map((root): PublicThread => ({ ...base(root), replies: (byParent.get(root.id) ?? []).map(base) })),
      nextCursor: roots.length > COMMENT_PAGE_SIZE && last ? encodeCursor(last.id) : null,
    };
  }

  /** Đánh giá và mọi bình luận của chính khách ở bài này; `isHidden` tính cả trường hợp bình luận gốc bị ẩn. */
  async mine(customerId: string, lessonId: string): Promise<MyCommunity> {
    await this.assertVisible(lessonId);
    const [rating, rows] = await Promise.all([
      this.prisma.courseRating.findUnique({ where: { customerId_lessonId: { customerId, lessonId } }, select: { stars: true } }),
      this.prisma.courseComment.findMany({
        where: { customerId, lessonId },
        orderBy: { id: 'desc' },
        take: 200,
        include: { customer: { select: { name: true } }, parent: { select: { isHidden: true } } },
      }),
    ]);
    return {
      myRating: rating?.stars ?? null,
      comments: rows.map((r): MyComment => ({ ...base(r), isHidden: r.isHidden || r.parent?.isHidden === true })),
    };
  }

  // ── đánh giá ───────────────────────────────────────────────

  async setRating(customerId: string, lessonId: string, stars: number): Promise<MyRating> {
    await this.requirePosting(customerId);
    await this.assertVisible(lessonId);
    await this.access.assertLessonAccess(customerId, lessonId); // bài khoá cần gói (C5)
    try {
      await this.prisma.courseRating.upsert({
        where: { customerId_lessonId: { customerId, lessonId } },
        create: { customerId, lessonId, stars },
        update: { stars },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2003') throw await this.fkError(customerId, LESSON_NOT_FOUND);
      throw err;
    }
    return { myRating: stars, rating: await this.ratingSummary(lessonId) };
  }

  /** Gỡ đánh giá của mình (idempotent). Không cần bài còn công khai. */
  async removeRating(customerId: string, lessonId: string): Promise<MyRating> {
    await this.prisma.courseRating.deleteMany({ where: { customerId, lessonId } });
    // Bài không còn công khai thì không trả số liệu (tránh lộ điểm của bài đang ẩn).
    const visible = await this.prisma.courseLesson.findFirst({ where: { id: lessonId, ...VISIBLE_LESSON }, select: { id: true } });
    return { myRating: null, rating: visible ? await this.ratingSummary(lessonId) : { average: null, count: 0 } };
  }

  // ── bình luận ──────────────────────────────────────────────

  async create(customerId: string, lessonId: string, body: CreateCommentBody): Promise<MyComment> {
    await this.requirePosting(customerId);
    await this.assertVisible(lessonId);
    await this.access.assertLessonAccess(customerId, lessonId); // bài khoá cần gói (C5)
    if (body.parentId) {
      const parent = await this.prisma.courseComment.findFirst({ where: { id: body.parentId, lessonId, parentId: null, isHidden: false }, select: { id: true } });
      if (!parent) throw notFound(COMMENT_NOT_FOUND);
    }
    if (await this.prisma.courseComment.findFirst({ where: { customerId, lessonId, body: body.body }, select: { id: true } })) throw inUse(DUPLICATE);
    try {
      const row = await this.prisma.courseComment.create({
        data: { lessonId, customerId, parentId: body.parentId, body: body.body },
        include: { customer: { select: { name: true } } },
      });
      return { ...base(row), isHidden: false };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2003') throw await this.fkError(customerId, COMMENT_NOT_FOUND);
      throw err;
    }
  }

  async edit(customerId: string, id: string, bodyText: string): Promise<MyComment> {
    await this.requirePosting(customerId);
    const own = await this.prisma.courseComment.findFirst({
      where: { id, customerId, lesson: VISIBLE_LESSON },
      select: { lessonId: true, isHidden: true, body: true, parent: { select: { isHidden: true } } },
    });
    if (!own) throw notFound(COMMENT_NOT_FOUND);
    await this.access.assertLessonAccess(customerId, own.lessonId); // bài khoá cần gói (C5)
    if (own.body === bodyText) {
      // Không đổi gì thì không đánh dấu "đã chỉnh sửa".
      const same = await this.prisma.courseComment.findUnique({ where: { id }, include: { customer: { select: { name: true } } } });
      if (!same) throw notFound(COMMENT_NOT_FOUND);
      return { ...base(same), isHidden: same.isHidden || own.parent?.isHidden === true };
    }
    if (await this.prisma.courseComment.findFirst({ where: { customerId, lessonId: own.lessonId, body: bodyText, NOT: { id } }, select: { id: true } })) throw inUse(DUPLICATE);
    try {
      const row = await this.prisma.courseComment.update({
        where: { id },
        data: { body: bodyText, editedAt: new Date() },
        include: { customer: { select: { name: true } } },
      });
      return { ...base(row), isHidden: row.isHidden || own.parent?.isHidden === true };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') throw notFound(COMMENT_NOT_FOUND);
      throw err;
    }
  }

  /** Xoá bình luận của mình (kèm trả lời bên dưới). Idempotent; không cần bài còn công khai. */
  async remove(customerId: string, id: string): Promise<void> {
    await this.prisma.courseComment.deleteMany({ where: { id, customerId } });
  }

  // ── admin ──────────────────────────────────────────────────

  async adminList(q: { lessonId?: string; hidden?: boolean; cursor?: string; limit: number }): Promise<AdminCommentPage> {
    if (q.lessonId && !(await this.prisma.courseLesson.findUnique({ where: { id: q.lessonId }, select: { id: true } }))) throw notFound(LESSON_NOT_FOUND);
    const cursor = decodeCursor(q.cursor);
    const rows = await this.prisma.courseComment.findMany({
      where: {
        ...(q.lessonId ? { lessonId: q.lessonId } : {}),
        // "Ẩn" gồm cả trả lời nằm dưới bình luận gốc bị ẩn (công khai cũng không thấy chúng).
        ...(q.hidden === true ? { OR: [{ isHidden: true }, { parent: { is: { isHidden: true } } }] } : {}),
        ...(q.hidden === false ? { isHidden: false, NOT: { parent: { is: { isHidden: true } } } } : {}),
        ...beforeCursor(cursor),
      },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      include: { customer: { select: { id: true, name: true, email: true } }, lesson: { select: { title: true } }, parent: { select: { isHidden: true } } },
    });
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(
        (r): AdminComment => ({
          id: r.id,
          lessonId: r.lessonId,
          lessonTitle: r.lesson.title,
          parentId: r.parentId,
          body: r.body,
          isHidden: r.isHidden,
          parentHidden: r.parent?.isHidden === true,
          edited: r.editedAt !== null,
          createdAt: r.createdAt.toISOString(),
          customer: r.customer,
        }),
      ),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.id) : null,
    };
  }

  async adminSetHidden(id: string, hidden: boolean): Promise<{ id: string; isHidden: boolean }> {
    try {
      const row = await this.prisma.courseComment.update({ where: { id }, data: { isHidden: hidden }, select: { id: true, isHidden: true } });
      return row;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') throw notFound(COMMENT_NOT_FOUND);
      throw err;
    }
  }

  async adminRemove(id: string): Promise<void> {
    const { count } = await this.prisma.courseComment.deleteMany({ where: { id } });
    if (count === 0) throw notFound(COMMENT_NOT_FOUND);
  }
}
