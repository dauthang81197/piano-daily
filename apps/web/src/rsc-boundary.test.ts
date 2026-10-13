import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

const isClient = (source: string) => /^\s*(['"])use client\1/.test(source);
const files = walk(SRC).map((file) => ({ file, source: readFileSync(file, 'utf8') }));
const clientFiles = files.filter((f) => isClient(f.source));
const serverFiles = files.filter((f) => !isClient(f.source));

/** Tên giá trị (không phải type) mà file `'use client'` export. */
function valueExports(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)) names.push(m[1]!);
  return names;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (files.some((f) => f.file === base + ext)) return base + ext;
  return null;
}

/**
 * React Server Components biến mọi export của file `'use client'` thành tham chiếu: server component chỉ được dùng chúng
 * làm component (JSX), KHÔNG được gọi như hàm. Gọi hàm thường (vd. `apiBase()`) từ file client ở server làm trang lỗi 500 ở
 * production dù vitest (không phân biệt server/client) vẫn xanh. Hàm dùng chung phải nằm ở file không có `'use client'`.
 */
describe('ranh giới server/client của Next', () => {
  it('server component không import hàm/hằng thường (chữ cái đầu thường) từ file "use client"', () => {
    const offenders: string[] = [];
    for (const { file, source } of serverFiles) {
      for (const m of source.matchAll(/import\s+(?!type\b)\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
        const target = resolve(file, m[2]!);
        const client = clientFiles.find((c) => c.file === target);
        if (!client) continue;
        const exported = new Set(valueExports(client.source));
        for (const raw of m[1]!.split(',')) {
          const name = raw.trim().replace(/^type\s+.*/, '').split(/\s+as\s+/)[0]!.trim();
          if (name && exported.has(name) && /^[a-z]/.test(name)) offenders.push(`${path.relative(SRC, file)} import { ${name} } từ ${path.relative(SRC, target!)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('bắt được đúng lỗi cũ: apiBase/availableDownloads từng nằm trong download-buttons.tsx ("use client")', () => {
    const client = clientFiles.find((c) => c.file.endsWith('components/sheet/download-buttons.tsx'));
    expect(client).toBeDefined();
    expect(valueExports(client!.source)).not.toContain('apiBase');
    expect(valueExports(client!.source)).not.toContain('availableDownloads');
  });
});
