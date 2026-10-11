import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Kiểm cấu hình deploy Cloudflare (Story 5.1) bằng cách đọc file; không chạy Docker hay server thật.
const ROOT = path.resolve(__dirname, '../../../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

/** Khối của một service trong compose (từ `  name:` đến service kế tiếp). */
function service(compose: string, name: string): string {
  const match = new RegExp(`^  ${name}:\\n((?:    .*\\n|\\s*\\n)*)`, 'm').exec(compose);
  if (!match) throw new Error(`Không thấy service ${name}`);
  return match[1]!;
}

describe('docker-compose.cloudflare.yml', () => {
  const compose = stripComments(read('docker-compose.cloudflare.yml'));

  it('Postgres không publish cổng; chỉ caddy publish 80 và 443', () => {
    expect(service(compose, 'postgres')).not.toMatch(/^\s+ports:/m);
    for (const name of ['api', 'web', 'admin']) expect(service(compose, name)).not.toMatch(/^\s+ports:/m);
    const ports = [...service(compose, 'caddy').matchAll(/^\s+- '(\d+:\d+)'/gm)].map((m) => m[1]);
    expect(ports).toEqual(['80:80', '443:443']);
    expect(compose).not.toMatch(/8443|9443/);
  });

  it('service backup chạy riêng, build từ deploy/backup, đọc bucket private, không publish cổng', () => {
    const backup = service(compose, 'backup');
    expect(backup).toContain('build: ./deploy/backup');
    expect(backup).toContain('restart: unless-stopped');
    expect(backup).not.toMatch(/^\s+ports:/m);
    expect(backup).toContain('S3_BUCKET_PRIVATE: ${S3_BUCKET_PRIVATE:?');
    expect(backup).not.toContain('S3_BUCKET_PUBLIC');
    expect(backup).toMatch(/postgres:\n\s+condition: service_healthy/);
    const example = read('deploy/.env.cloudflare.example');
    expect(example).toMatch(/^BACKUP_AT=03:00$/m);
    expect(example).toMatch(/^BACKUP_KEEP=14$/m);
  });

  it('cảnh báo vận hành: ALERT_EMAIL cho api, backup có URL và secret nội bộ', () => {
    expect(service(compose, 'api')).toContain('ALERT_EMAIL:');
    const backup = service(compose, 'backup');
    expect(backup).toContain('API_INTERNAL_URL: http://api:4000');
    expect(backup).toContain('INTERNAL_API_SECRET: ${INTERNAL_API_SECRET:?');
    expect(read('deploy/.env.cloudflare.example')).toContain('ALERT_EMAIL=');
  });

  it('api đúng một instance', () => {
    expect(compose).not.toMatch(/replicas|scale:/);
  });

  it('domain đến từ ROOT_DOMAIN và CORS khớp admin./gốc', () => {
    expect(compose).toContain('CORS_ADMIN_ORIGIN: https://admin.${ROOT_DOMAIN');
    expect(compose).toContain('CORS_WEB_ORIGIN: https://${ROOT_DOMAIN}');
    expect(compose).toContain('./deploy/Caddyfile.cloudflare:/etc/caddy/Caddyfile:ro');
  });

  it('secret bắt buộc khi production', () => {
    const api = service(compose, 'api');
    expect(api).toContain('NODE_ENV: production');
    for (const v of [
      'JWT_ACCESS_SECRET',
      'INTERNAL_API_SECRET',
      'VIEW_SALT',
      'PAYPAL_CLIENT_ID',
      'PAYPAL_CLIENT_SECRET',
      'PAYPAL_WEBHOOK_ID',
      'RESEND_API_KEY',
      'EMAIL_FROM',
    ]) {
      expect(api).toContain(`${v}: \${${v}:?`);
    }
  });
});

describe('deploy/Caddyfile.cloudflare', () => {
  const raw = read('deploy/Caddyfile.cloudflare');
  const caddy = stripComments(raw);

  it('trusted_proxies là dải Cloudflare (IPv4 + IPv6) và đọc CF-Connecting-IP', () => {
    expect(caddy).toMatch(/trusted_proxies static [^\n]*173\.245\.48\.0\/20[^\n]*104\.16\.0\.0\/13/);
    expect(caddy).toMatch(/trusted_proxies static [^\n]*2400:cb00::\/32[^\n]*2c0f:f248::\/32/);
    expect(caddy).toContain('client_ip_headers CF-Connecting-IP');
  });

  it('ba host qua ROOT_DOMAIN tới đúng container, không ghi cứng domain', () => {
    expect(caddy).toMatch(/^\{\$ROOT_DOMAIN\} \{[\s\S]*?reverse_proxy web:4100/m);
    expect(caddy).toMatch(/^admin\.\{\$ROOT_DOMAIN\} \{[\s\S]*?reverse_proxy admin:4101/m);
    expect(caddy).toMatch(/^api\.\{\$ROOT_DOMAIN\} \{[\s\S]*?reverse_proxy api:4000/m);
    expect(raw).toContain('cdn.{$ROOT_DOMAIN}');
    expect(caddy).not.toMatch(/sslip\.io|SITE_HOST/);
  });

  it('chuyển IP khách thật bằng {client_ip}, không ghi đè bằng {remote_host}', () => {
    expect(caddy).toContain('header_up CF-Connecting-IP {client_ip}');
    expect(caddy).not.toContain('{remote_host}');
  });
});

describe('script deploy', () => {
  const firewall = path.join(ROOT, 'deploy/cloudflare-firewall.sh');
  const hasBash = (() => {
    try {
      execFileSync('bash', ['-c', 'true']);
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasBash)('cloudflare-firewall.sh --dry-run in lệnh ufw allow cho từng dải mà không chạy', () => {
    const script = read('deploy/cloudflare-firewall.sh');
    expect(script).toContain('--dry-run');
    expect(script).toMatch(/BASH_SOURCE\[0\]/);

    const out = execFileSync('bash', [firewall, '--dry-run'], { encoding: 'utf8' });
    const ranges = [...script.matchAll(/\b(?:\d+\.){3}\d+\/\d+|\b[0-9a-f]{4}:[0-9a-f:]+\/\d+/g)].map((m) => m[0]);
    expect(ranges.length).toBeGreaterThanOrEqual(22);
    for (const range of new Set(ranges)) {
      expect(out).toContain(`ufw allow from ${range} to any port 80 proto tcp`);
      expect(out).toContain(`ufw allow from ${range} to any port 443 proto tcp`);
    }
    expect(out).not.toMatch(/port (8443|9443)/);
  });

  it.skipIf(!hasBash)('smoke-check.sh thoát mã 2 khi thiếu ROOT_DOMAIN', () => {
    expect(read('deploy/smoke-check.sh')).toContain('curl');

    let code = 0;
    try {
      execFileSync('bash', [path.join(ROOT, 'deploy/smoke-check.sh')], { stdio: 'pipe' });
    } catch (err) {
      code = (err as { status: number }).status;
    }
    expect(code).toBe(2);
  });
});
