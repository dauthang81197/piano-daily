import type { GrantPlanBody, GrantPlanResponse, Plan, PlanBody, SubscriptionPayment } from '@piano-daily/shared';
import { apiFetch } from './client';

const PATH = '/admin/plans';
const item = (id: string) => `${PATH}/${encodeURIComponent(id)}`;

/** Admin Plans API (S2 thuê bao). Ghi và cấp gói chỉ SUPER_ADMIN (API trả 403 cho EDITOR). */
export const plansApi = {
  list: (signal?: AbortSignal) => apiFetch<Plan[]>(PATH, { signal }),
  create: (body: PlanBody) => apiFetch<Plan>(PATH, { method: 'POST', json: body }),
  update: (id: string, body: PlanBody) => apiFetch<Plan>(item(id), { method: 'PATCH', json: body }),
  setActive: (id: string, isActive: boolean) => apiFetch<Plan>(`${item(id)}/active`, { method: 'PATCH', json: { isActive } }),
  remove: (id: string) => apiFetch<void>(item(id), { method: 'DELETE' }),
  /** `GET /admin/subscription-payments` — thanh toán gói gần đây (chỉ đọc), mới nhất trước. */
  payments: (signal?: AbortSignal) => apiFetch<SubscriptionPayment[]>('/admin/subscription-payments', { signal }),
  /** `POST /admin/subscriptions/grant` — cấp tay một gói cho khách theo email (thử nghiệm khi chưa có thanh toán). */
  grant: (body: GrantPlanBody) => apiFetch<GrantPlanResponse>('/admin/subscriptions/grant', { method: 'POST', json: body }),
};
