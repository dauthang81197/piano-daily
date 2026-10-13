import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';

/** Kiểm tra khách được phép tải: tài khoản còn hoạt động và đã xác minh email. S2 sẽ thêm quota/gói vào đây. */
@Injectable()
export class CustomerAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireDownloadAccess(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { isActive: true, emailVerifiedAt: true },
    });
    if (!customer?.isActive) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    if (!customer.emailVerifiedAt) throw new AppException(ErrorCode.EMAIL_NOT_VERIFIED, HttpStatus.FORBIDDEN);
  }
}
