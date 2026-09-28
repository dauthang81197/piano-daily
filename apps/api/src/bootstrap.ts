import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

/** Cấu hình dùng chung cho main.ts và integration test. */
export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.use(helmet());
  // Đọc cookie refresh token (`req.cookies`).
  app.use(cookieParser());
  app.enableShutdownHooks();
}
