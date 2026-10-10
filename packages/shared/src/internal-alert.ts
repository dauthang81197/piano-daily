import { z } from 'zod';

/** Loại cảnh báo mà dịch vụ ngoài API (job backup) được phép báo qua `POST /internal/alerts`. */
export const INTERNAL_ALERT_KINDS = ['BACKUP_FAILED'] as const;

export const internalAlertRequestSchema = z.object({
  kind: z.enum(INTERNAL_ALERT_KINDS),
  detail: z.string().max(500),
});
export type InternalAlertRequest = z.infer<typeof internalAlertRequestSchema>;
