import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ErrorResponse } from '@piano-daily/shared';
import type { Response } from 'express';
import { Logger } from 'nestjs-pino';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  INTERNAL_ERROR: 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại sau.',
  NOT_FOUND: 'Không tìm thấy tài nguyên được yêu cầu.',
  VALIDATION_FAILED: 'Dữ liệu gửi lên không hợp lệ.',
  SERVICE_UNAVAILABLE: 'Dịch vụ tạm thời không sẵn sàng. Vui lòng thử lại sau.',
};

/**
 * Exception chủ động của API, mang sẵn mã lỗi từ danh mục shared.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: number,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? DEFAULT_MESSAGE[code], status);
  }
}

/**
 * Status 4xx mà lỗi ngoài Nest tự mang theo (vd. `PayloadTooLargeError` 413 của body-parser
 * có `status`/`statusCode`). Trả `undefined` nếu không phải số nguyên 4xx.
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status, statusCode } = exception as { status?: unknown; statusCode?: unknown };
  for (const candidate of [status, statusCode]) {
    if (Number.isInteger(candidate) && (candidate as number) >= 400 && (candidate as number) < 500) {
      return candidate as number;
    }
  }
  return undefined;
}

export function toErrorResponse(exception: unknown): { status: number; body: ErrorResponse } {
  if (exception instanceof AppException) {
    const body: ErrorResponse = { error: { code: exception.code, message: exception.message } };
    if (exception.details !== undefined) body.error.details = exception.details;
    return { status: exception.getStatus(), body };
  }

  const status = exception instanceof HttpException ? exception.getStatus() : clientErrorStatus(exception);
  if (status !== undefined) {
    const code = STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
    // Luôn dùng thông điệp chuẩn theo mã: nội dung gốc có thể chứa chi tiết nội bộ.
    return { status, body: { error: { code, message: DEFAULT_MESSAGE[code] } } };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: { code: ErrorCode.INTERNAL_ERROR, message: DEFAULT_MESSAGE.INTERNAL_ERROR } },
  };
}

/**
 * Filter toàn cục: mọi lỗi đều trả `{error:{code,message,details?}}`, không bao giờ kèm stack.
 * Lỗi 5xx được log kèm `requestId` (nestjs-pino gắn theo ngữ cảnh request).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = toErrorResponse(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, code: body.error.code }, 'Request failed', AllExceptionsFilter.name);
    }

    res.status(status).json(body);
  }
}
