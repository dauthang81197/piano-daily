import type { INestApplication } from '@nestjs/common';
import type { CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Env } from './config/env';

/** Cấu hình dùng chung cho main.ts và integration test. */
export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.use(helmet());
  // CORS theo allowlist tường minh: chỉ origin admin, kèm credentials (cookie refresh) — AD-18.
  // Dùng delegate thay vì `{ origin: [...] }`: gói `cors` vẫn gửi `Allow-Credentials`/`Allow-Methods`
  // cho origin không khớp; `origin: false` bỏ qua hẳn CORS nên origin lạ không nhận header `Access-Control-Allow-*`.
  // Mọi response đều `Vary: Origin` (kể cả origin bị từ chối / không có Origin), để cache trung gian không
  // trả response của origin này cho origin khác. `res.vary` khử trùng lặp với header do `cors` thêm.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.vary('Origin');
    next();
  });
  const allowedOrigins = [app.get(ConfigService<Env, true>).get('CORS_ADMIN_ORIGIN', { infer: true })];
  const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
    const origin = req.headers.origin;
    callback(null, origin && allowedOrigins.includes(origin) ? { origin: true, credentials: true } : { origin: false });
  };
  app.enableCors(corsDelegate);
  // Đọc cookie refresh token (`req.cookies`).
  app.use(cookieParser());
  app.enableShutdownHooks();
}
