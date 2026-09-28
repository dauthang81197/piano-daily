import 'reflect-metadata';
import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ImATeapotException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode, errorResponseSchema } from '@piano-daily/shared';
import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter, AppException, toErrorResponse } from '../../src/common/http-exception.filter';
import { validationExceptionFactory } from '../../src/common/validation';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  const logger = { error: vi.fn() } as unknown as Logger;
  new AllExceptionsFilter(logger).catch(exception, host);
  return { status, json, logger };
}

describe('AllExceptionsFilter', () => {
  it.each([
    [new NotFoundException('Cannot GET /khong-co'), 404, ErrorCode.NOT_FOUND],
    [new BadRequestException(), 400, ErrorCode.VALIDATION_FAILED],
    [new ServiceUnavailableException(), 503, ErrorCode.SERVICE_UNAVAILABLE],
    [new UnauthorizedException(), 401, ErrorCode.UNAUTHORIZED],
    [new ForbiddenException(), 403, ErrorCode.FORBIDDEN],
    [new HttpException('ThrottlerException: Too Many Requests', 429), 429, ErrorCode.TOO_MANY_REQUESTS],
    [new ImATeapotException(), 418, ErrorCode.INTERNAL_ERROR],
  ])('%s -> %i %s', (exception, expectedStatus, expectedCode) => {
    const { status, json } = run(exception);
    expect(status).toHaveBeenCalledWith(expectedStatus);
    const body = errorResponseSchema.parse(json.mock.calls[0]?.[0]);
    expect(body.error.code).toBe(expectedCode);
  });

  it('lỗi thường -> 500 INTERNAL_ERROR, không lộ message/stack, có log error', () => {
    const { status, json, logger } = run(new Error('secret db password leaked'));
    expect(status).toHaveBeenCalledWith(500);
    const payload = json.mock.calls[0]?.[0];
    expect(errorResponseSchema.parse(payload).error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(JSON.stringify(payload)).not.toContain('secret');
    expect(JSON.stringify(payload)).not.toContain('stack');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('lỗi ngoài Nest mang status 4xx (body-parser 413) -> giữ status, không log error', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      name: 'PayloadTooLargeError',
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
    });
    const { status, json, logger } = run(tooLarge);
    expect(status).toHaveBeenCalledWith(413);
    expect(errorResponseSchema.parse(json.mock.calls[0]?.[0]).error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('status không hợp lệ (5xx, không nguyên) trên lỗi thường vẫn là 500', () => {
    expect(toErrorResponse(Object.assign(new Error('x'), { status: 502 })).status).toBe(500);
    expect(toErrorResponse(Object.assign(new Error('x'), { statusCode: 404.5 })).status).toBe(500);
  });

  it('lỗi 4xx không bị log ở mức error', () => {
    const { logger } = run(new NotFoundException());
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('AppException giữ nguyên code, message và details', () => {
    const { status, body } = toErrorResponse(
      new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, 'Tiêu đề bắt buộc.', { field: 'title' }),
    );
    expect(status).toBe(400);
    expect(body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Tiêu đề bắt buộc.', details: { field: 'title' } },
    });
  });

  it('exceptionFactory của pipe -> 400 VALIDATION_FAILED, details [{path, message}]', () => {
    const { status, body } = toErrorResponse(
      validationExceptionFactory([
        { message: 'Email không hợp lệ.', path: ['email'] },
        { message: 'Sai', path: [{ key: 'items' }, 0, 'name'] },
        { message: 'Body bắt buộc' },
      ]),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual([
      { path: 'email', message: 'Email không hợp lệ.' },
      { path: 'items.0.name', message: 'Sai' },
      { path: '', message: 'Body bắt buộc' },
    ]);
  });
});
