'use client';

import { LoaderCircle, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { previewController, type PreviewStatus } from '@/lib/midi/preview-controller';
import { hasWebAudio, unlockAudioContext } from '@/lib/midi/tone-audio';

/**
 * Nút nghe thử 10–15 giây trên thumbnail của thẻ Sheet (Story 2.9). Là `<button>` anh em của link thẻ (không lồng
 * trong `<a>`), `z-10` để bấm không kích hoạt link phủ nên không điều hướng. Thiết bị có hover: ẩn mờ, hiện khi hover
 * thẻ hoặc focus bàn phím; thiết bị cảm ứng: luôn hiện; đang tải/phát/lỗi: luôn hiện.
 *
 * Mã tải sẵn chỉ gồm nút và bộ điều phối: lõi preview (kéo theo Tone.js, `zod`) tải lazy khi bấm.
 */
export function CardPreviewButton({ id, title, noteJsonUrl }: { id: string; title: string; noteJsonUrl: string }) {
  const t = useTranslations('Card');
  const [supported, setSupported] = useState(true);
  const status: PreviewStatus = useSyncExternalStore(
    previewController.subscribe,
    () => previewController.statusOf(id),
    () => 'idle',
  );

  useEffect(() => {
    // Thiếu Web Audio: chỉ biết được ở trình duyệt, nên ẩn nút sau khi mount.
    setSupported(hasWebAudio());
    // Thẻ bị gỡ khỏi trang (đổi trang, điều hướng) khi đang phát thì dừng.
    return () => previewController.stopIf(id);
  }, [id]);

  if (!supported) return null;

  const onClick = () => {
    void previewController.toggle(id, (onEnd) => {
      // Mở khoá AudioContext đồng bộ trong cú bấm, trước mọi await (Safari/iOS).
      const unlocked = unlockAudioContext();
      return import('@/lib/midi/card-preview').then((m) => m.startCardPreview(noteJsonUrl, unlocked, onEnd));
    });
  };

  const label =
    status === 'playing'
      ? t('previewStop', { title })
      : status === 'loading'
        ? t('previewLoading', { title })
        : status === 'error'
          ? t('previewError', { title })
          : t('previewPlay', { title });
  const Icon = status === 'playing' ? Square : status === 'loading' ? LoaderCircle : Play;
  const hidden = status === 'idle' ? '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100' : '';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-busy={status === 'loading' || undefined}
      data-state={status}
      className={`absolute bottom-2 right-2 z-10 flex size-11 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_2px_8px_rgba(36,27,20,0.25)] transition-opacity hover:bg-primary/90 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${hidden} ${status === 'error' ? 'ring-2 ring-error' : ''}`}
    >
      <Icon aria-hidden="true" className={`size-5 ${status === 'loading' ? 'motion-safe:animate-spin' : ''}`} />
    </button>
  );
}
