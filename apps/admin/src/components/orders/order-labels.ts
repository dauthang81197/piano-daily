import type { DownloadStatus, OrderStatus } from '@piano-daily/shared';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã huỷ',
  REFUNDED: 'Đã hoàn tiền',
};

export const TOKEN_STATUS_LABELS: Record<DownloadStatus, string> = {
  ACTIVE: 'Còn hiệu lực',
  EXPIRED: 'Hết hạn',
  EXHAUSTED: 'Hết lượt tải',
  REVOKED: 'Đã vô hiệu',
};

/** Cờ "cần xem xét" nổi bật: có chữ kèm icon (không chỉ dựa vào màu). */
export const REVIEW_LABEL = 'Cần xem xét';
