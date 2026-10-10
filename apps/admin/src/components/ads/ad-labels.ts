import { AdPosition } from '@piano-daily/shared';

export const POSITION_ORDER: readonly AdPosition[] = [
  AdPosition.HEADER,
  AdPosition.SIDEBAR_LEFT,
  AdPosition.SIDEBAR_RIGHT,
  AdPosition.IN_LIST,
  AdPosition.STICKY_BOTTOM,
  AdPosition.IN_CONTENT,
];

export const POSITION_LABELS: Record<AdPosition, string> = {
  HEADER: 'Đầu trang (Header)',
  SIDEBAR_LEFT: 'Cột trái',
  SIDEBAR_RIGHT: 'Cột phải',
  IN_LIST: 'Dưới lưới Sheet',
  STICKY_BOTTOM: 'Cố định cuối trang',
  IN_CONTENT: 'Trong nội dung',
};

export const READ_ONLY_REASON = 'Chỉ SUPER_ADMIN được thay đổi quảng cáo. Tài khoản của bạn chỉ có quyền xem.';
