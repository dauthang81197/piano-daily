import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = path.resolve(process.cwd(), 'src');

/** Resolve import nội bộ (`@/…` hoặc tương đối) ra đường dẫn file; gói ngoài trả `null`. */
function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(src, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (existsSync(base + ext)) return base + ext;
  return null;
}

/** Import giá trị (tĩnh) của một file: bỏ `import type` (bị xoá khi build) nhưng giữ `export … from`. */
function staticSpecifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const imports = [...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => m[1]!);
  const bare = [...text.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
  const reexports = [...text.matchAll(/^export\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => m[1]!);
  return [...imports, ...bare, ...reexports];
}

/** Mọi file và gói ngoài mà `entry` kéo vào bundle ban đầu (chỉ theo import tĩnh; `import()` động bị bỏ qua). */
function eagerGraph(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const spec of staticSpecifiers(file)) {
      const local = resolveLocal(file, spec);
      if (local) visit(local);
      else packages.add(spec);
    }
  };
  visit(entry);
  return { files: [...files].map((f) => path.relative(src, f)), packages: [...packages] };
}

describe('bundle ban đầu của MIDI player (NFR6)', () => {
  const graph = eagerGraph(path.join(src, 'components/sheet/midi-player.tsx'));

  it('đồ thị import tĩnh có kiểm tra được (đủ các file player)', () => {
    expect(graph.files).toEqual(
      expect.arrayContaining([
        'components/sheet/midi-player.tsx',
        'components/sheet/piano-keyboard.tsx',
        'lib/midi/keyboard-layout.ts',
        'lib/midi/player-core.ts',
        'lib/midi/tone-audio.ts',
        'lib/midi/fetch-note-json.ts',
        'lib/midi/note-name.ts',
      ]),
    );
  });

  it('không kéo zod, tone hay note-json vào bundle ban đầu (theo cả import bắc cầu và re-export)', () => {
    expect(graph.packages).not.toContain('zod');
    expect(graph.packages).not.toContain('tone');
    expect(graph.files).not.toContain('lib/midi/note-json.ts');
  });

  it('Tone.js và note-json chỉ được nạp bằng import() động', () => {
    expect(readFileSync(path.join(src, 'lib/midi/tone-audio.ts'), 'utf8')).toContain("await import('tone')");
    expect(readFileSync(path.join(src, 'components/sheet/midi-player.tsx'), 'utf8')).toContain(
      "await import('@/lib/midi/note-json')",
    );
  });

  it('bộ dò bắt được vi phạm: file giả import zod hoặc note-json thì bị phát hiện', () => {
    // Kiểm chứng chính bộ dò trên một đồ thị mà ta biết có zod: note-json.ts.
    const bad = eagerGraph(path.join(src, 'lib/midi/note-json.ts'));
    expect(bad.packages).toContain('zod');
  });
});
