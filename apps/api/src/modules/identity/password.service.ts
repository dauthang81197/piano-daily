import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;

/**
 * Hash bcrypt (cost 12) của một chuỗi ngẫu nhiên không ai biết. Dùng để vẫn chạy bcrypt khi email
 * không tồn tại, giữ thời gian xử lý login tương đương (không lộ email có tồn tại hay không).
 */
export const DUMMY_HASH = '$2b$12$BUquU5NJVDP02A4euKx7PODSL4pSIwRmvfGOWtE1YfmGTUlwcPZTa';

/** bcryptjs (JS thuần): không cần build native trong image bookworm-slim. */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  /** So khớp mật khẩu; `hash` không có (user không tồn tại) vẫn tốn cùng thời gian và luôn trả `false`. */
  async verify(plain: string, hash: string | undefined): Promise<boolean> {
    const matches = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
    return hash !== undefined && matches;
  }
}
