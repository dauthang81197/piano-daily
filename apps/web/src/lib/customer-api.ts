import {
  type CustomerDownloadResponse,
  customerDownloadResponseSchema,
  type CustomerEmailRequest,
  type CustomerLocale,
  type CustomerLoginRequest,
  type CustomerRegisterRequest,
  type CustomerSession,
  customerSessionSchema,
  type CreatePlanOrderResponse,
  createPlanOrderResponseSchema,
  type CreateVietqrResponse,
  createVietqrResponseSchema,
  type PaymentStatusResponse,
  paymentStatusResponseSchema,
  type Entitlement,
  entitlementSchema,
  type CourseProgress,
  courseProgressSchema,
  type LessonCompletion,
  lessonCompletionSchema,
  type LessonFull,
  lessonFullSchema,
  type LessonSubmission,
  type MyComment,
  myCommentSchema,
  type MyCommunity,
  myCommunitySchema,
  type MyRating,
  myRatingSchema,
  lessonSubmissionSchema,
  type ScoreConversion,
  scoreConversionSchema,
} from '@piano-daily/shared';
import type { z } from 'zod';
import { ApiError, toApiError } from '@/lib/public-api';
import { publicApiUrl } from '@/lib/public-env';

/**
 * Lời gọi API tài khoản khách từ trình duyệt. Khác `public-api.ts` ở chỗ gửi cookie (`credentials: 'include'`, cookie
 * `customer_refresh` chỉ gắn vào path `/customer`) và có thể kèm access token trong bộ nhớ.
 */
async function call(path: string, init: RequestInit, accessToken?: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${publicApiUrl()}${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        // FormData: để trình duyệt tự đặt Content-Type kèm boundary.
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ.');
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

/**
 * POST multipart có báo tiến độ tải lên (`fetch` chưa có sự kiện tiến độ upload nên dùng XMLHttpRequest). Trả `Response` để dùng
 * lại `toApiError`/`parsed`: cùng cách ánh xạ lỗi như `call`. `onProgress` nhận tỉ lệ 0..1.
 */
function postWithProgress(path: string, form: FormData, accessToken: string, onProgress: (fraction: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${publicApiUrl()}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ.'));
    xhr.ontimeout = xhr.onerror;
    xhr.onload = () => {
      const res = new Response(xhr.status === 204 ? null : xhr.responseText, { status: xhr.status, headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) void toApiError(res).then(reject, reject);
      else resolve(res);
    };
    xhr.send(form);
  });
}

async function parsed<S extends z.ZodType>(res: Response, schema: S): Promise<z.output<S>> {
  const result = schema.safeParse(await res.json().catch(() => undefined));
  if (!result.success) throw new ApiError(res.status, 'INTERNAL_ERROR', 'Phản hồi của máy chủ không hợp lệ.');
  return result.data;
}

const post = (body?: unknown): RequestInit => ({ method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const customerApi = {
  async register(body: CustomerRegisterRequest): Promise<void> {
    await call('/customer/auth/register', post(body));
  },
  async login(body: CustomerLoginRequest): Promise<CustomerSession> {
    return parsed(await call('/customer/auth/login', post(body)), customerSessionSchema);
  },
  async google(idToken: string, locale: CustomerLocale): Promise<CustomerSession> {
    return parsed(await call('/customer/auth/google', post({ idToken, locale })), customerSessionSchema);
  },
  async refresh(): Promise<CustomerSession> {
    return parsed(await call('/customer/auth/refresh', post()), customerSessionSchema);
  },
  async logout(): Promise<void> {
    await call('/customer/auth/logout', post());
  },
  async verifyEmail(token: string): Promise<void> {
    await call('/customer/auth/verify-email', post({ token }));
  },
  async resendVerification(body: CustomerEmailRequest): Promise<void> {
    await call('/customer/auth/resend-verification', post(body));
  },
  async forgotPassword(body: CustomerEmailRequest): Promise<void> {
    await call('/customer/auth/forgot-password', post(body));
  },
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await call('/customer/auth/reset-password', post({ token, newPassword }));
  },
  /** Tiến độ khoá học của khách (C2): bài đã học (chỉ bài đang công khai) và số bài theo nhánh. */
  async courseProgress(accessToken: string): Promise<CourseProgress> {
    return parsed(await call('/customer/courses/progress', { method: 'GET' }, accessToken), courseProgressSchema);
  },
  async setLessonCompletion(accessToken: string, lessonId: string, completed: boolean): Promise<LessonCompletion> {
    const init: RequestInit = { method: 'PUT', body: JSON.stringify({ completed }) };
    return parsed(await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/completion`, init, accessToken), lessonCompletionSchema);
  },
  /** Nội dung đầy đủ của bài khoá (C5): 402 `PLAN_REQUIRED` khi chưa có gói ACTIVE còn hạn. */
  async lessonFull(accessToken: string, lessonId: string, locale: string): Promise<LessonFull> {
    const query = `?locale=${locale === 'en' ? 'en' : 'vi'}`;
    return parsed(await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/full${query}`, { method: 'GET' }, accessToken), lessonFullSchema);
  },
  /** Bài nộp của khách cho một bài (C3): link YouTube/Drive. */
  async lessonSubmission(accessToken: string, lessonId: string): Promise<LessonSubmission> {
    return parsed(await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/submission`, { method: 'GET' }, accessToken), lessonSubmissionSchema);
  },
  async saveSubmission(accessToken: string, lessonId: string, body: { url: string; note: string | null }): Promise<LessonSubmission> {
    const init: RequestInit = { method: 'PUT', body: JSON.stringify(body) };
    return parsed(await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/submission`, init, accessToken), lessonSubmissionSchema);
  },
  async deleteSubmission(accessToken: string, lessonId: string): Promise<void> {
    await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/submission`, { method: 'DELETE' }, accessToken);
  },
  /** Cộng đồng (C4): đánh giá + bình luận của chính khách (kể cả bình luận đang bị ẩn). */
  async myCommunity(accessToken: string, lessonId: string): Promise<MyCommunity> {
    return parsed(await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/community/mine`, { method: 'GET' }, accessToken), myCommunitySchema);
  },
  async setRating(accessToken: string, lessonId: string, stars: number): Promise<MyRating> {
    const init: RequestInit = { method: 'PUT', body: JSON.stringify({ stars }) };
    return parsed(await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/rating`, init, accessToken), myRatingSchema);
  },
  async removeRating(accessToken: string, lessonId: string): Promise<MyRating> {
    return parsed(await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/rating`, { method: 'DELETE' }, accessToken), myRatingSchema);
  },
  async createComment(accessToken: string, lessonId: string, body: { body: string; parentId: string | null }): Promise<MyComment> {
    return parsed(await call(`/customer/courses/lessons/${encodeURIComponent(lessonId)}/comments`, post(body), accessToken), myCommentSchema);
  },
  async editComment(accessToken: string, id: string, body: string): Promise<MyComment> {
    const init: RequestInit = { method: 'PATCH', body: JSON.stringify({ body }) };
    return parsed(await call(`/customer/courses/comments/${encodeURIComponent(id)}`, init, accessToken), myCommentSchema);
  },
  async deleteComment(accessToken: string, id: string): Promise<void> {
    await call(`/customer/courses/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }, accessToken);
  },
  async entitlement(accessToken: string): Promise<Entitlement> {
    return parsed(await call('/customer/entitlement', { method: 'GET' }, accessToken), entitlementSchema);
  },
  /** Tạo đơn PayPal cho một gói (giá do server quyết định). */
  async createPlanOrder(accessToken: string, planId: string): Promise<CreatePlanOrderResponse> {
    return parsed(await call('/customer/subscriptions/paypal/create-order', post({ planId }), accessToken), createPlanOrderResponseSchema);
  },
  /** Capture đơn PayPal của gói và kích hoạt; trả entitlement mới. */
  async capturePlanOrder(accessToken: string, paypalOrderId: string): Promise<Entitlement> {
    return parsed(await call('/customer/subscriptions/paypal/capture-order', post({ paypalOrderId }), accessToken), entitlementSchema);
  },
  /** Tạo (hoặc lấy lại trong 24 giờ) thanh toán VietQR cho một gói: ảnh QR + thông tin chuyển khoản. */
  async createVietqr(accessToken: string, planId: string): Promise<CreateVietqrResponse> {
    return parsed(await call('/customer/subscriptions/vietqr/create', post({ planId }), accessToken), createVietqrResponseSchema);
  },
  /** Trạng thái thanh toán (polling); kèm entitlement khi đã PAID. */
  async paymentStatus(accessToken: string, code: string): Promise<PaymentStatusResponse> {
    return parsed(
      await call(`/customer/subscriptions/payments/${encodeURIComponent(code)}`, { method: 'GET' }, accessToken),
      paymentStatusResponseSchema,
    );
  },
  /** Chuyển bản nhạc (PDF/ảnh/MusicXML) sang MIDI: trả 202 kèm việc `PENDING`; lỗi 429/415/413/503 mang mã API. */
  async createScore(accessToken: string, file: File, transpose: number, onProgress?: (fraction: number) => void): Promise<ScoreConversion> {
    const form = new FormData();
    form.append('transpose', String(transpose));
    form.append('file', file);
    const res = onProgress
      ? await postWithProgress('/customer/scores', form, accessToken, onProgress)
      : await call('/customer/scores', { method: 'POST', body: form }, accessToken);
    return parsed(res, scoreConversionSchema);
  },
  async getScore(accessToken: string, id: string): Promise<ScoreConversion> {
    return parsed(await call(`/customer/scores/${encodeURIComponent(id)}`, { method: 'GET' }, accessToken), scoreConversionSchema);
  },
  async deleteScore(accessToken: string, id: string): Promise<void> {
    await call(`/customer/scores/${encodeURIComponent(id)}`, { method: 'DELETE' }, accessToken);
  },
  async download(accessToken: string, sheetId: string, fileType: string): Promise<CustomerDownloadResponse> {
    const res = await call(
      `/customer/downloads/${encodeURIComponent(sheetId)}/${encodeURIComponent(fileType)}`,
      post(),
      accessToken,
    );
    return parsed(res, customerDownloadResponseSchema);
  },
};
