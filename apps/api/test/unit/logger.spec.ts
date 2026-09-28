import { createServer, type Server } from 'node:http';
import { pinoHttp, type Options } from 'pino-http';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLoggerParams } from '../../src/common/logger';

type LogLine = Record<string, unknown> & {
  requestId?: string;
  req?: { url?: string; headers?: Record<string, unknown> };
  res?: { statusCode?: number };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Server http thuần dùng đúng cấu hình pino-http của API; log ghi vào mảng `lines`. */
function setup(): { server: Server; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const destination = { write: (chunk: string) => void lines.push(JSON.parse(chunk) as LogLine) };
  const options = buildLoggerParams({ LOG_LEVEL: 'info' }).pinoHttp as Options;
  const httpLogger = pinoHttp(options, destination);
  const server = createServer((req, res) => {
    httpLogger(req, res);
    res.statusCode = req.url === '/health-down' || req.headers['x-fail'] ? 503 : 200;
    res.end('ok');
  });
  return { server, lines };
}

/** Dòng log "request completed" được ghi khi response `finish`: chờ nó xuất hiện. */
async function completedLine(lines: LogLine[], url: string): Promise<LogLine> {
  return vi.waitFor(() => {
    const line = lines.find((l) => l.req?.url === url && l.res !== undefined);
    if (!line) throw new Error(`chưa có log cho ${url}`);
    return line;
  });
}

describe('buildLoggerParams (pino-http)', () => {
  let server: Server;
  let lines: LogLine[];

  beforeEach(() => {
    ({ server, lines } = setup());
  });

  it('requestId của dòng log trùng header x-request-id của response', async () => {
    const res = await request(server).get('/a');
    const line = await completedLine(lines, '/a');
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(line.requestId).toBe(res.headers['x-request-id']);
  });

  it('dùng lại X-Request-Id hợp lệ từ client', async () => {
    const res = await request(server).get('/b').set('X-Request-Id', 'trace-123.abc_DEF');
    const line = await completedLine(lines, '/b');
    expect(res.headers['x-request-id']).toBe('trace-123.abc_DEF');
    expect(line.requestId).toBe('trace-123.abc_DEF');
  });

  it.each([
    ['chứa khoảng trắng', 'bad id'],
    ['dài hơn 128 ký tự', 'a'.repeat(129)],
  ])('X-Request-Id không hợp lệ (%s) bị thay bằng id sinh mới', async (_label, bad) => {
    const res = await request(server).get('/c').set('X-Request-Id', bad);
    const line = await completedLine(lines, '/c');
    expect(res.headers['x-request-id']).not.toBe(bad);
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(line.requestId).toBe(res.headers['x-request-id']);
  });

  it('che header nhạy cảm/mang IP và không log remoteAddress', async () => {
    await request(server)
      .get('/d')
      .set('Authorization', 'Bearer secret-token')
      .set('Cookie', 'refresh=secret-cookie')
      .set('Proxy-Authorization', 'Basic secret-proxy')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('Forwarded', 'for=203.0.113.7');
    const line = await completedLine(lines, '/d');
    const headers = line.req?.headers ?? {};
    for (const name of ['authorization', 'cookie', 'proxy-authorization', 'x-forwarded-for', 'forwarded']) {
      expect(headers[name], name).toBe('[REDACTED]');
    }
    const raw = JSON.stringify(lines);
    expect(raw).not.toContain('remoteAddress');
    expect(raw).not.toMatch(/secret-|203\.0\.113\.7/);
  });

  it('không log /health thành công, nhưng vẫn log /health lỗi', async () => {
    await request(server).get('/health').expect(200);
    await request(server).get('/health').set('X-Fail', '1').expect(503);
    const failed = await completedLine(lines, '/health');
    expect(failed.res?.statusCode).toBe(503);
    expect(lines.filter((l) => l.req?.url === '/health')).toHaveLength(1);
  });
});
