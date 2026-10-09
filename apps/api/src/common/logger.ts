import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

function requestPath(req: IncomingMessage): string {
  const url = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '';
  return url.split('?')[0] ?? '';
}

/** Dùng lại `X-Request-Id` từ proxy nếu hợp lệ, nếu không thì sinh UUID mới; luôn trả về header. */
export function genRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/**
 * Cấu hình pino JSON: mỗi dòng log của request có `requestId`.
 * Không log header nhạy cảm (authorization, cookie), không log IP thô.
 */
/** Token tải là bearer credential nằm trong đường dẫn `/downloads/:token`: che đi trước khi log. */
export function redactTokenInUrl(url: string): string {
  return url.replace(/^(\/downloads\/)[^/?#]+/, '$1[REDACTED]');
}

export function buildLoggerParams(env: Pick<Env, 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: genRequestId,
      // Gắn `requestId` vào child logger của request: mọi dòng log trong request đều có nó.
      customProps: (req) => ({ requestId: req.id }),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'req.headers["proxy-authorization"]',
          // Header mang IP khách (không log IP thô).
          'req.headers["x-forwarded-for"]',
          'req.headers["x-real-ip"]',
          'req.headers["cf-connecting-ip"]',
          'req.headers["true-client-ip"]',
          'req.headers.forwarded',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        // Bỏ remoteAddress/remotePort: không log IP thô.
        req: (req: { method: string; url: string; headers: Record<string, unknown> }) => ({
          method: req.method,
          url: redactTokenInUrl(req.url),
          headers: req.headers,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      // Tính lúc response xong (đã biết status): bỏ log `/health` thành công do healthcheck
      // của compose gọi mỗi 10s; `/health` lỗi (503…) vẫn được log. (Không dùng `autoLogging.ignore`
      // vì pino-http gọi nó lúc request bắt đầu, khi chưa có status.)
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        if (res.statusCode < 300 && requestPath(req) === '/health') return 'silent';
        return 'info';
      },
    },
  };
}
