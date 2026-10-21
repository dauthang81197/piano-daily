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
  return { files: [...files].map((f) => path.relative(src, f).split(path.sep).join('/')), packages: [...packages] };
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
    const player = readFileSync(path.join(src, 'components/sheet/midi-player.tsx'), 'utf8');
    expect(player).toContain("import('@/lib/midi/note-json')");
  });

  it('bộ chia tay trái/phải (mixer) chỉ được nạp bằng import() động cùng note-json, không vào bundle ban đầu', () => {
    expect(graph.files).not.toContain('lib/midi/hands/hand-split.ts');
    expect(readFileSync(path.join(src, 'components/sheet/midi-player.tsx'), 'utf8')).toContain("import('@/lib/midi/hands/hand-split')");
  });

  it('cài đặt góc nhìn/màu và bảng của nó nằm trong bundle ban đầu mà không kéo three', () => {
    expect(graph.files).toContain('lib/midi/scene3d/view-settings.ts');
    expect(graph.files).toContain('components/sheet/view-settings-panel.tsx');
    expect(graph.packages.filter((p) => p.startsWith('three'))).toEqual([]);
  });

  it('three, loader, model và cảnh 3D chỉ được nạp bằng import() động khi player sẵn sàng', () => {
    expect(graph.packages).not.toContain('three');
    expect(graph.packages.filter((p) => p.startsWith('three'))).toEqual([]);
    for (const heavy of [
      'components/sheet/piano-view.tsx',
      'components/sheet/piano-scene.ts',
      'lib/midi/hands/hand-path.ts',
      'lib/midi/scene3d/hand-rig.ts',
      'lib/midi/scene3d/hand-animator.ts',
      'lib/midi/scene3d/hand-driver.ts',
      'lib/midi/scene3d/smoothing.ts',
      'lib/midi/scene3d/view-apply.ts',
      'lib/midi/scene3d/world.ts',
    ]) {
      expect(graph.files).not.toContain(heavy);
    }
    expect(readFileSync(path.join(src, 'components/sheet/midi-player.tsx'), 'utf8')).toContain("import('./piano-view')");
    expect(readFileSync(path.join(src, 'components/sheet/piano-view.tsx'), 'utf8')).toContain("await import('./piano-scene')");
  });

  it('khuông nhạc: VexFlow, bộ dựng khuông và NotationView chỉ được nạp bằng import() động', () => {
    expect(graph.packages.filter((p) => p.startsWith('vexflow'))).toEqual([]);
    for (const heavy of ['components/sheet/notation-view.tsx', 'lib/midi/notation/render.ts', 'lib/midi/notation/quantize.ts']) {
      expect(graph.files).not.toContain(heavy);
    }
    expect(readFileSync(path.join(src, 'components/sheet/midi-player.tsx'), 'utf8')).toContain("import('./notation-view')");
    expect(readFileSync(path.join(src, 'lib/midi/notation/render.ts'), 'utf8')).toContain("await import('vexflow/core')");
  });

  it('bộ dò bắt được vi phạm: file giả import zod hoặc note-json thì bị phát hiện', () => {
    // Kiểm chứng chính bộ dò trên một đồ thị mà ta biết có zod: note-json.ts.
    const bad = eagerGraph(path.join(src, 'lib/midi/note-json.ts'));
    expect(bad.packages).toContain('zod');
    // Và trên lớp phủ bàn tay: cảnh 3D kéo `three` vào đồ thị tĩnh của chính nó.
    expect(eagerGraph(path.join(src, 'components/sheet/piano-scene.ts')).packages).toContain('three');
  });
});

describe('bundle ban đầu của nút nghe thử trên thẻ (NFR6, Story 2.9)', () => {
  const graph = eagerGraph(path.join(src, 'components/catalog/card-preview-button.tsx'));

  it('chỉ kéo nút, bộ điều phối và adapter nhẹ; không kéo zod, tone, note-json, lõi phát hay lõi preview', () => {
    expect(graph.files).toEqual(
      expect.arrayContaining(['components/catalog/card-preview-button.tsx', 'lib/midi/preview-controller.ts', 'lib/midi/tone-audio.ts']),
    );
    expect(graph.packages).not.toContain('zod');
    expect(graph.packages).not.toContain('tone');
    for (const heavy of ['lib/midi/note-json.ts', 'lib/midi/card-preview.ts', 'lib/midi/player-core.ts', 'lib/midi/fetch-note-json.ts']) {
      expect(graph.files).not.toContain(heavy);
    }
  });

  it('lõi preview chỉ được nạp bằng import() động khi bấm', () => {
    expect(readFileSync(path.join(src, 'components/catalog/card-preview-button.tsx'), 'utf8')).toContain(
      "import('@/lib/midi/card-preview')",
    );
  });

  it('SheetCard (server component) chỉ import nút, không import lõi preview', () => {
    const card = eagerGraph(path.join(src, 'components/catalog/sheet-card.tsx'));
    expect(card.packages).not.toContain('zod');
    expect(card.packages).not.toContain('tone');
    expect(card.files).not.toContain('lib/midi/card-preview.ts');
  });
});
