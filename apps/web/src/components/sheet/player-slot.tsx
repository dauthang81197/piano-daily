import type { PublicSheetDetail } from '@piano-daily/shared';
import { MidiPlayer } from './midi-player';

/**
 * Vị trí của MIDI player trong bố cục trang chi tiết (giữa meta và ảnh trang). Sheet không có MIDI (hoặc chưa có
 * note-JSON) thì không hiện khối. Player là client component, tải Tone.js và note-JSON chỉ khi người dùng bấm phát.
 */
export function PlayerSlot({ midi, title }: { midi: PublicSheetDetail['midi']; title: string }) {
  if (!midi) return null;
  // `key` theo URL: điều hướng sang Sheet khác phải dựng player mới, không giữ lõi/âm thanh của bài trước.
  return <MidiPlayer key={midi.noteJsonUrl} noteJsonUrl={midi.noteJsonUrl} title={title} />;
}
