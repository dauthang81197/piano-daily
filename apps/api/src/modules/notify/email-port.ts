/** Port gửi email (AD-1): mọi module chỉ gửi email qua giao diện này; nhà cung cấp nằm trong adapter. */
export const EMAIL_PORT = Symbol('EMAIL_PORT');

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailPort {
  /**
   * Gửi một email. Trả `false` khi adapter bỏ qua vì chưa cấu hình (không ném lỗi); lỗi gửi thật thì ném.
   * Caller coi `undefined`/`true` là đã gửi.
   */
  send(message: EmailMessage): Promise<boolean | void>;
}
