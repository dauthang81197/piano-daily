'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeEvents, measureAt } from '@/lib/midi/notation/active';
import { packSystems, systemOfMeasure } from '@/lib/midi/notation/layout';
import { buildNotation } from '@/lib/midi/notation/quantize';
import { loadVexflow, playheadX, renderSystem, type RenderedSystem, type Vex } from '@/lib/midi/notation/render';
import type { ParsedNotes } from '@/lib/midi/note-json';

const PADDING = 16;
/** Vẽ dòng đang xem và một dòng mỗi phía; dòng đã vẽ giữ nguyên (bài tối đa 120 ô nhịp nên không phình). */
const RENDER_AHEAD = 1;

interface Props {
  parsed: Pick<ParsedNotes, 'notes' | 'header'>;
  /** Vị trí phát (giây), cập nhật ~30 lần/giây khi đang phát. */
  position: number;
  /** Tua tới `seconds` (cùng đường với thanh tua của player). */
  onSeek: (seconds: number) => void;
  title: string;
  /** Hệ số phóng to khuông nhạc (0.7–2); mặc định 1. */
  zoom?: number;
  /** Lấp đầy chiều cao của khung chứa (toàn màn hình) thay vì giới hạn 26rem. */
  fill?: boolean;
}

/**
 * Khuông nhạc hai khoá đồng bộ với player (C1b). VexFlow nạp động; chỉ vẽ dòng gần vị trí đang xem. Hợp âm đang vang được
 * tô bằng thuộc tính `data-notation-active` (CSS), vạch phát nội suy theo thời gian giữa các nốt, khuông cuộn theo dòng hiện tại.
 */
export default function NotationView({ parsed, position, onSeek, title, zoom = 1, fill = false }: Props) {
  const t = useTranslations('Player');
  const notation = useMemo(() => {
    try {
      return buildNotation(parsed);
    } catch {
      return null;
    }
  }, [parsed]);
  const [vex, setVex] = useState<Vex | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const holders = useRef<(HTMLDivElement | null)[]>([]);
  const wrappers = useRef<(HTMLDivElement | null)[]>([]);
  const rendered = useRef(new Map<number, RenderedSystem>());
  const lit = useRef<Set<SVGElement>>(new Set());
  const broken = useRef<Set<number>>(new Set());
  const [renderTick, setRenderTick] = useState(0);
  const lastSystem = useRef(-1);

  useEffect(() => {
    let alive = true;
    loadVexflow().then(
      (module) => alive && setVex(module),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  // Bề rộng khả dụng; đổi bề rộng thì xếp lại dòng và vẽ lại.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // Gộp các lần đổi kích thước trong cùng một khung hình (kéo cửa sổ, thanh cuộn hiện/ẩn).
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const systems = useMemo(
    () => (notation && width > 0 ? packSystems(notation.measures, Math.max(160, width / zoom - PADDING * 2)) : []),
    [notation, width, zoom],
  );

  // Xếp lại dòng: bỏ mọi dòng đã vẽ.
  useEffect(() => {
    rendered.current.clear();
    broken.current.clear();
    lit.current.clear();
    lastSystem.current = -1;
  }, [systems]);

  const current = notation && systems.length > 0 ? systemOfMeasure(systems, measureAt(notation, position).index) : 0;

  // Vẽ dòng đang xem ± RENDER_AHEAD (khi VexFlow sẵn sàng).
  useEffect(() => {
    if (!vex || !notation || systems.length === 0) return;
    let drew = false;
    for (let i = Math.max(0, current - RENDER_AHEAD); i <= Math.min(systems.length - 1, current + RENDER_AHEAD); i++) {
      const holder = holders.current[i];
      if (!holder || rendered.current.has(i) || broken.current.has(i)) continue;
      try {
        // `currentColor`: nốt theo màu chữ của khung nên đổi chủ đề sáng/tối không cần vẽ lại.
        rendered.current.set(i, renderSystem(vex, holder, notation, systems[i]!, 'currentColor'));
        drew = true;
      } catch {
        // Một dòng lỗi thì bỏ riêng dòng đó; chỉ khi chưa vẽ được dòng nào mới ẩn cả khuông.
        holder.replaceChildren();
        broken.current.add(i);
        if (rendered.current.size === 0) setFailed(true);
      }
    }
    if (drew) setRenderTick((n) => n + 1);
  }, [vex, notation, systems, current]);

  // Tô hợp âm đang vang (đổi thuộc tính trên phần tử đã vẽ, không dựng lại).
  useEffect(() => {
    if (!notation) return;
    const wanted = new Set<SVGElement>();
    const system = rendered.current.get(current);
    if (system)
      for (const event of activeEvents(notation, position)) {
        const el = system.elements.get(event.id);
        if (el) wanted.add(el);
      }
    for (const el of lit.current) if (!wanted.has(el)) el.removeAttribute('data-notation-active');
    for (const el of wanted) el.setAttribute('data-notation-active', 'true');
    lit.current = wanted;
  }, [notation, position, current, renderTick]);

  // Cuộn tới dòng hiện tại khi đổi dòng (kể cả khi tua).
  useEffect(() => {
    if (current === lastSystem.current) return;
    lastSystem.current = current;
    const box = scroller.current;
    const target = wrappers.current[current];
    if (box && target) box.scrollTo({ top: Math.max(0, target.offsetTop - PADDING) });
  }, [current, systems]);

  const onClickSystem = useCallback(
    (index: number, event: React.MouseEvent<HTMLDivElement>) => {
      const system = rendered.current.get(index);
      if (!system || !notation) return;
      // Phóng to bằng CSS `zoom`: toạ độ chuột (px màn hình) chia lại về toạ độ của hình đã vẽ.
      const x = (event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom;
      const hit = system.measures.find((m) => x >= m.x && x < m.x + m.width);
      if (hit) onSeek(notation.measures[hit.index]!.startSec);
    },
    [notation, onSeek, zoom],
  );

  if (!notation || failed) {
    return (
      <p role="status" className="rounded-md bg-surface-container-low p-3 text-body-md text-on-surface-variant">
        {t('notationError')}
      </p>
    );
  }

  const head = rendered.current.get(current);
  const x = head ? playheadX(head.anchors, position) : null;

  return (
    <div className={`flex flex-col gap-2 ${fill ? 'min-h-0 flex-1' : ''}`}>
      <div
        ref={scroller}
        role="img"
        aria-label={t('notationLabel', { title })}
        className={`notation-scroll relative overflow-y-auto rounded-md border border-outline-variant bg-surface-container-lowest p-2 text-on-surface ${fill ? 'min-h-0 flex-1' : 'max-h-[26rem]'}`}
      >
        {!vex ? <p className="p-2 text-caption text-on-surface-variant">{t('notationLoading')}</p> : null}
        <div aria-hidden="true" style={zoom === 1 ? undefined : { zoom }}>
          {systems.map((system, i) => (
            <div
              key={`${width}-${i}`}
              ref={(el) => {
                wrappers.current[i] = el;
              }}
              onClick={(e) => onClickSystem(i, e)}
              className="relative cursor-pointer"
              style={{ minHeight: 190 }}
            >
              <div
                ref={(el) => {
                  holders.current[i] = el;
                }}
              />
              {i === current && x !== null ? (
                <span
                  data-testid="notation-playhead"
                  className="pointer-events-none absolute top-2 h-[170px] w-0.5 bg-secondary"
                  style={{ left: x }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {notation.truncated ? (
        <p className="text-caption text-on-surface-variant">{t('notationTruncated', { count: notation.measures.length })}</p>
      ) : null}
      <p className="text-caption text-on-surface-variant">{t('notationNote')}</p>
    </div>
  );
}
