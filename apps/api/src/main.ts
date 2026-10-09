import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config as loadDotenv } from 'dotenv';
import { APP_OPTIONS, configureApp } from './bootstrap';
import { ENV_FILE_PATHS, EnvValidationError, validateEnv, type Env } from './config/env';

/** Ghi một dòng log JSON theo định dạng pino (level 60 = fatal) khi logger của Nest chưa có. */
function fatal(msg: string, extra: Record<string, unknown> = {}): never {
  process.stderr.write(`${JSON.stringify({ level: 60, time: Date.now(), msg, ...extra })}\n`);
  process.exit(1);
}

async function bootstrap(): Promise<void> {
  // Validate env TRƯỚC khi nạp AppModule: thiếu biến thì thoát ngay, log nêu tên biến, không kèm stack.
  loadDotenv({ path: ENV_FILE_PATHS, quiet: true });
  try {
    validateEnv(process.env);
  } catch (err) {
    if (err instanceof EnvValidationError) fatal(err.message, { invalidEnv: err.variables });
    throw err;
  }

  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false, ...APP_OPTIONS });
  configureApp(app);
  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  fatal('API failed to start', { err: { type: (err as Error)?.name, message: (err as Error)?.message } });
});
