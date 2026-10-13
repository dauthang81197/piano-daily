import {
  type CustomerDownloadResponse,
  customerDownloadResponseSchema,
  type CustomerEmailRequest,
  type CustomerLocale,
  type CustomerLoginRequest,
  type CustomerRegisterRequest,
  type CustomerSession,
  customerSessionSchema,
  type Entitlement,
  entitlementSchema,
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
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ.');
  }
  if (!res.ok) throw await toApiError(res);
  return res;
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
  async entitlement(accessToken: string): Promise<Entitlement> {
    return parsed(await call('/customer/entitlement', { method: 'GET' }, accessToken), entitlementSchema);
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
