import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type ExtendTokenBody } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { notFound } from '../catalog/catalog.helpers';
import { DownloadTokenRepository } from './download-token.repository';
import { OrderRepository } from './order.repository';

/** Đơn không PAID: từ chối rõ ràng (409). */
export function orderNotPaid(): AppException {
  return new AppException(ErrorCode.ORDER_NOT_PAID, HttpStatus.CONFLICT);
}

/** Link tải đã bị vô hiệu: không bao giờ bỏ vô hiệu hoá (409). */
export function tokenRevoked(): AppException {
  return new AppException(ErrorCode.TOKEN_REVOKED, HttpStatus.CONFLICT, 'Link tải của đơn này đã bị vô hiệu nên không thể thao tác.');
}

/** Gia hạn token (Story 4.2); nơi duy nhất (cùng `DownloadTokenRepository`) đổi hạn/lượt của token đã phát. */
@Injectable()
export class TokenService {
  constructor(
    private readonly tokens: DownloadTokenRepository,
    private readonly orders: OrderRepository,
  ) {}

  /**
   * Thêm ngày và/hoặc lượt tải cho token của Order PAID bằng một UPDATE có điều kiện.
   * Không áp dụng được thì đọc lại để phân loại: Order lạ 404, không PAID 409, chưa có token 404, đã vô hiệu 409, vượt giới hạn 400.
   */
  async extend(orderId: string, body: ExtendTokenBody): Promise<void> {
    if (body.addDays === undefined && body.addDownloads === undefined) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'addDays', message: 'Nhập số ngày hoặc số lượt cần thêm.' },
      ]);
    }
    if (await this.tokens.extend(orderId, body)) return;

    const status = await this.orders.findStatus(orderId);
    if (status === null) throw notFound('Không tìm thấy đơn hàng.');
    if (status !== 'PAID') throw orderNotPaid();
    const state = await this.tokens.findStateByOrderId(orderId);
    if (!state) throw notFound('Đơn chưa có link tải.');
    if (state.revokedAt !== null) throw tokenRevoked();
    throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, 'Giá trị sau khi gia hạn vượt giới hạn cho phép.', [
      { path: 'addDays', message: 'Giá trị sau khi gia hạn vượt giới hạn cho phép.' },
    ]);
  }
}
