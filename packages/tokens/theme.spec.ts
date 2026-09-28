import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const theme = readFileSync(path.join(import.meta.dirname, 'theme.css'), 'utf8');
const design = readFileSync(
  path.join(root, '_bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/DESIGN.md'),
  'utf8',
);

/** Lấy các cặp `key: value` một cấp trong một khối frontmatter (colors/rounded/spacing). */
function frontmatterBlock(name: string): Record<string, string> {
  const frontmatter = design.split(/^---$/m)[1] ?? '';
  const block = frontmatter.match(new RegExp(`^${name}:\\n((?: {2}.+\\n)+)`, 'm'))?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/^ {2}([\w-]+): '?([^'\n]+)'?$/gm)].map((m) => [m[1] as string, m[2] as string]),
  );
}

function themeVar(name: string): string | undefined {
  return theme.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
}

describe('Ivory & Walnut theme khớp DESIGN.md', () => {
  const colors = frontmatterBlock('colors');

  it('đọc được bảng màu từ DESIGN.md', () => {
    expect(Object.keys(colors).length).toBeGreaterThan(20);
  });

  it.each(Object.entries(colors))('--color-%s = %s', (key, value) => {
    expect(themeVar(`color-${key}`)?.toLowerCase()).toBe(value.toLowerCase());
  });

  it.each(Object.entries(frontmatterBlock('rounded')))('rounded.%s = %s', (key, value) => {
    expect(themeVar(key === 'DEFAULT' ? 'radius' : `radius-${key}`)).toBe(value);
  });

  it.each(Object.entries(frontmatterBlock('spacing')))('spacing.%s = %s', (key, value) => {
    expect(themeVar(`spacing-${key}`)).toBe(value);
  });

  it('có scale typography và font family', () => {
    for (const key of ['display-lg', 'display-lg-mobile', 'headline-md', 'headline-sm', 'body-lg', 'body-md', 'label-caps', 'caption']) {
      expect(themeVar(`text-${key}`), key).toMatch(/^\d+px$/);
    }
    expect(themeVar('font-display')).toContain('Playfair Display');
    expect(themeVar('font-sans')).toContain('Be Vietnam Pro');
  });
});
