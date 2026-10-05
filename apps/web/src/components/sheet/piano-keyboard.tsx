import type { FallingNote, KeyboardLayout } from '@/lib/midi/keyboard-layout';

/** Chiều cao (đơn vị "phím trắng = 1 rộng") của vùng nốt rơi, phím trắng và phím đen. */
const FALL_H = 5;
const WHITE_H = 3.4;
const BLACK_H = 2.1;

/**
 * Phím đàn ảo (SVG): phím trắng `surface-bright`, phím đen `on-surface`, nốt đang phát tô brass kèm tên nốt bằng chữ
 * (không chỉ dựa vào màu), nốt sắp tới rơi xuống phím. Không animation CSS: chuyển động chỉ do vị trí thay đổi theo thời gian.
 */
export function PianoKeyboard({
  layout,
  active,
  falling,
  label,
}: {
  layout: KeyboardLayout;
  /** Số nốt MIDI đang phát. */
  active: ReadonlySet<number>;
  falling: readonly FallingNote[];
  label: string;
}) {
  const whites = layout.keys.filter((k) => !k.black);
  const blacks = layout.keys.filter((k) => k.black);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${layout.whiteKeys} ${FALL_H + WHITE_H}`}
      className="h-auto w-full rounded-md border border-outline-variant bg-surface-container-low"
    >
      <g data-part="falling">
        {falling.map(({ note, top, bottom }, i) => {
          const key = layout.byMidi.get(note.midi);
          if (!key) return null;
          const inset = key.black ? 0.08 : 0.12;
          const y = top * FALL_H;
          const height = Math.max(0.05, (bottom - top) * FALL_H);
          return (
            <g key={`${note.midi}-${note.time}-${i}`} data-falling={note.name}>
              <rect
                x={key.x + inset}
                y={y}
                width={key.width - inset * 2}
                height={height}
                rx={0.12}
                className={key.black ? 'fill-secondary' : 'fill-secondary/70'}
              />
              {height >= 0.7 && key.width - inset * 2 >= 0.5 ? (
                <text
                  x={key.x + key.width / 2}
                  y={y + height - 0.18}
                  textAnchor="middle"
                  fontSize={0.38}
                  className="fill-on-surface"
                >
                  {note.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      <g data-part="keys" transform={`translate(0 ${FALL_H})`}>
        {whites.map((key) => {
          const on = active.has(key.midi);
          return (
            <g key={key.midi}>
              <rect
                x={key.x}
                y={0}
                width={key.width}
                height={WHITE_H}
                data-midi={key.midi}
                data-active={on ? 'true' : undefined}
                className={`stroke-outline-variant ${on ? 'fill-secondary' : 'fill-surface-bright'}`}
                strokeWidth={0.04}
              />
              {on ? (
                <text
                  x={key.x + key.width / 2}
                  y={WHITE_H - 0.3}
                  textAnchor="middle"
                  fontSize={0.42}
                  fontWeight={600}
                  className="fill-on-surface"
                >
                  {key.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {blacks.map((key) => {
          const on = active.has(key.midi);
          return (
            <g key={key.midi}>
              <rect
                x={key.x}
                y={0}
                width={key.width}
                height={BLACK_H}
                rx={0.06}
                data-midi={key.midi}
                data-active={on ? 'true' : undefined}
                className={on ? 'fill-secondary stroke-on-surface' : 'fill-on-surface'}
                strokeWidth={on ? 0.06 : 0}
              />
              {on ? (
                <text
                  x={key.x + key.width / 2}
                  y={BLACK_H - 0.25}
                  textAnchor="middle"
                  fontSize={0.34}
                  fontWeight={600}
                  className="fill-on-surface"
                >
                  {key.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
