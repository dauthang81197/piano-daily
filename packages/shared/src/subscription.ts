import { z } from 'zod';

/** Giới hạn gói thuê bao (S2); API, admin và web dùng chung. */
export const PLAN_NAME_MAX = 80;
export const PLAN_DESCRIPTION_MAX = 500;
export const PLAN_MAX_DURATION_DAYS = 3650;
export const PLAN_MAX_PRICE_VND = 1_000_000_000;
export const PLAN_MAX_PRICE_USD_CENTS = 10_000_000;
export const PLAN_MAX_QUOTA = 100_000;

/** Trạng thái Subscription; phải trùng enum `SubscriptionStatus` của Prisma (có test kiểm tra). */
export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/** Trạng thái thanh toán gói; phải trùng enum `SubscriptionPaymentStatus` của Prisma (có test kiểm tra). */
export const SubscriptionPaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type SubscriptionPaymentStatus = (typeof SubscriptionPaymentStatus)[keyof typeof SubscriptionPaymentStatus];
export const subscriptionPaymentStatusSchema = z.enum(SubscriptionPaymentStatus);

/** Cách thanh toán gói. */
export const SUBSCRIPTION_PAYMENT_PROVIDERS = ['PAYPAL', 'VIETQR'] as const;
export type SubscriptionPaymentProvider = (typeof SUBSCRIPTION_PAYMENT_PROVIDERS)[number];

/** Lý do hết quyền tải (cũng là mã lỗi 402). */
export const PAYWALL_REASONS = ['TRIAL_EXPIRED', 'PLAN_REQUIRED', 'QUOTA_EXCEEDED'] as const;
export type PaywallReason = (typeof PAYWALL_REASONS)[number];
export const paywallReasonSchema = z.enum(PAYWALL_REASONS);

const text = (max: number, message: string) => z.string({ error: message }).trim().max(max, { error: message });
const nameSchema = (label: string) =>
  text(PLAN_NAME_MAX, `${label} tối đa ${PLAN_NAME_MAX} ký tự.`).min(1, { error: `Vui lòng nhập ${label.toLowerCase()}.` });
const descriptionSchema = (label: string) =>
  text(PLAN_DESCRIPTION_MAX, `${label} tối đa ${PLAN_DESCRIPTION_MAX} ký tự.`);
const intField = (message: string, min: number, max: number) =>
  z.number({ error: message }).int({ error: message }).min(min, { error: message }).max(max, { error: message });

/** Thân tạo/sửa gói. `downloadQuota` null = không giới hạn lượt tải mỗi kỳ. */
export const planBodySchema = z.object({
  nameVi: nameSchema('Tên tiếng Việt'),
  nameEn: nameSchema('Tên tiếng Anh'),
  descriptionVi: descriptionSchema('Mô tả tiếng Việt'),
  descriptionEn: descriptionSchema('Mô tả tiếng Anh'),
  priceVnd: intField(`Giá VND phải là số nguyên từ 0 đến ${PLAN_MAX_PRICE_VND}.`, 0, PLAN_MAX_PRICE_VND),
  priceUsdCents: intField(`Giá USD (cent) phải là số nguyên từ 0 đến ${PLAN_MAX_PRICE_USD_CENTS}.`, 0, PLAN_MAX_PRICE_USD_CENTS),
  durationDays: intField(`Thời hạn phải là số nguyên từ 1 đến ${PLAN_MAX_DURATION_DAYS} ngày.`, 1, PLAN_MAX_DURATION_DAYS),
  downloadQuota: intField(`Hạn mức lượt tải phải là số nguyên từ 1 đến ${PLAN_MAX_QUOTA} (để trống nếu không giới hạn).`, 1, PLAN_MAX_QUOTA).nullable(),
  sortOrder: intField('Thứ tự phải là số nguyên từ 0 đến 1000.', 0, 1000),
  isActive: z.boolean({ error: 'isActive phải là true hoặc false.' }),
});
export type PlanBody = z.infer<typeof planBodySchema>;

export const setPlanActiveBodySchema = z.object({ isActive: z.boolean({ error: 'isActive phải là true hoặc false.' }) });
export type SetPlanActiveBody = z.infer<typeof setPlanActiveBodySchema>;

/** Gói cho admin. */
export const planSchema = planBodySchema.extend({
  id: z.string(),
  /** Số Subscription đang ACTIVE dùng gói này (admin biết gói còn người dùng). */
  activeSubscriptions: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Plan = z.infer<typeof planSchema>;

/** Gói công khai: chỉ gói đang bật; tên/mô tả theo từng ngôn ngữ. */
export const publicPlanSchema = z.object({
  id: z.string(),
  name: z.object({ vi: z.string(), en: z.string() }),
  description: z.object({ vi: z.string(), en: z.string() }),
  priceVnd: z.number().int().nonnegative(),
  priceUsdCents: z.number().int().nonnegative(),
  durationDays: z.number().int().positive(),
  downloadQuota: z.number().int().positive().nullable(),
});
export type PublicPlan = z.infer<typeof publicPlanSchema>;

/** Response `GET /plans`. */
export const publicPlansResponseSchema = z.object({
  subscriptionsEnabled: z.boolean(),
  plans: z.array(publicPlanSchema),
});
export type PublicPlansResponse = z.infer<typeof publicPlansResponseSchema>;

/** Response `GET /customer/entitlement`. */
export const entitlementSchema = z.object({
  subscriptionsEnabled: z.boolean(),
  /** Dùng thử: còn hiệu lực khi chưa qua hạn VÀ còn lượt. */
  trial: z.object({
    active: z.boolean(),
    endsAt: z.string().nullable(),
    downloadsLeft: z.number().int().nonnegative(),
    downloadsMax: z.number().int().nonnegative(),
  }),
  subscription: z
    .object({
      planId: z.string(),
      planName: z.object({ vi: z.string(), en: z.string() }),
      endsAt: z.string(),
      /** null = không giới hạn. */
      downloadsLeft: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  canDownload: z.boolean(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;

/** Body `POST /admin/subscriptions/grant`: cấp tay một gói cho khách theo email (thử nghiệm trước khi có thanh toán). */
export const grantPlanBodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: 'Email không hợp lệ.' })),
  planId: z.uuid({ error: 'Gói không hợp lệ.' }),
});
export type GrantPlanBody = z.infer<typeof grantPlanBodySchema>;

export const grantPlanResponseSchema = z.object({
  customerEmail: z.string(),
  planId: z.string(),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
});
export type GrantPlanResponse = z.infer<typeof grantPlanResponseSchema>;

/** Body `POST /customer/subscriptions/paypal/create-order`: giá và tiền tệ luôn lấy từ gói phía server. */
export const createPlanOrderRequestSchema = z.object({ planId: z.uuid({ error: 'Gói không hợp lệ.' }) });
export type CreatePlanOrderRequest = z.infer<typeof createPlanOrderRequestSchema>;

export const createPlanOrderResponseSchema = z.object({ paymentCode: z.string(), paypalOrderId: z.string() });
export type CreatePlanOrderResponse = z.infer<typeof createPlanOrderResponseSchema>;

/** Body `POST /customer/subscriptions/paypal/capture-order`. Phản hồi là `Entitlement` mới. */
export const capturePlanOrderRequestSchema = z.object({ paypalOrderId: z.string().trim().min(1).max(64) });
export type CapturePlanOrderRequest = z.infer<typeof capturePlanOrderRequestSchema>;

/** Thanh toán gói cho admin (chỉ đọc). `amount` là đơn vị nhỏ nhất của `currency` (USD cents / VND). */
export const subscriptionPaymentSchema = z.object({
  id: z.string(),
  code: z.string(),
  customerEmail: z.string(),
  planNameVi: z.string(),
  provider: z.enum(SUBSCRIPTION_PAYMENT_PROVIDERS),
  status: subscriptionPaymentStatusSchema,
  amount: z.number().int().nonnegative(),
  currency: z.enum(['USD', 'VND']),
  reviewRequired: z.boolean(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type SubscriptionPayment = z.infer<typeof subscriptionPaymentSchema>;
