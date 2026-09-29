import { FileType } from '@piano-daily/shared';
import { describe, expect, it, vi } from 'vitest';
import { MidiProcessingError, SheetMediaService, StorageWriteError } from '../../src/modules/media/sheet-media.service';
import type { StorageService } from '../../src/modules/media/storage.service';
import { corruptMidi, makeMidi, midiWithNoTracks } from '../fixtures/midi';

/** `StorageService` giả: chỉ ghi nhận lời gọi, không đụng S3 thật. `fail` (nếu có) làm lần ghi đó ném lỗi. */
function fakeStorage(fail?: { on: 'private' | 'public'; nth: number }) {
  const calls: { zone: 'private' | 'public'; key: string; contentType: string }[] = [];
  let privateN = 0;
  let publicN = 0;
  const storage = {
    putPrivate: vi.fn(async (key: string, _body: Buffer, contentType: string) => {
      privateN += 1;
      if (fail?.on === 'private' && fail.nth === privateN) throw new Error('giả lập lỗi S3');
      calls.push({ zone: 'private', key, contentType });
    }),
    putPublic: vi.fn(async (key: string, _body: Buffer, contentType: string) => {
      publicN += 1;
      if (fail?.on === 'public' && fail.nth === publicN) throw new Error('giả lập lỗi S3');
      calls.push({ zone: 'public', key, contentType });
    }),
  } as unknown as StorageService;
  return { storage, calls };
}

const SHEET_ID = '01920000-0000-7000-8000-000000000001';

describe('SheetMediaService.storeMidi', () => {
  it('MIDI hợp lệ -> ghi gốc (private, .mid) rồi note-JSON (public, .json); duration/noteCount đúng', async () => {
    const { storage, calls } = fakeStorage();
    const media = new SheetMediaService(undefined as never, storage);
    const buffer = makeMidi(3);

    const result = await media.storeMidi(SHEET_ID, { buffer, originalName: 'bai.mid' });

    expect(result.midi).toMatchObject({
      type: FileType.MIDI,
      mimeType: 'audio/midi',
      size: buffer.length,
      originalName: 'bai.mid',
      noteCount: 3,
    });
    expect(result.midi.durationSeconds).toBeGreaterThan(0);
    expect(result.midi.storageKey).toMatch(new RegExp(`^private/sheets/${SHEET_ID}/MIDI/[0-9a-f]{64}\\.mid$`));
    expect(result.json).toMatchObject({ type: FileType.MIDI_JSON, mimeType: 'application/json', originalName: null });
    expect(result.json.storageKey).toMatch(new RegExp(`^public/sheets/${SHEET_ID}/MIDI_JSON/[0-9a-f]{64}\\.json$`));
    expect(result.keys).toEqual([result.midi.storageKey, result.json.storageKey]);

    // Ghi file gốc (private) TRƯỚC note-JSON (public).
    expect(calls).toEqual([
      { zone: 'private', key: result.midi.storageKey, contentType: 'audio/midi' },
      { zone: 'public', key: result.json.storageKey, contentType: 'application/json' },
    ]);
  });

  it('nội dung note-JSON parse lại được và có track/notes', async () => {
    const { storage, calls } = fakeStorage();
    const media = new SheetMediaService(undefined as never, storage);
    await media.storeMidi(SHEET_ID, { buffer: makeMidi(2), originalName: null });
    const putPublic = storage.putPublic as unknown as ReturnType<typeof vi.fn>;
    const body = putPublic.mock.calls[0]![1] as Buffer;
    const json = JSON.parse(body.toString('utf8'));
    expect(json.tracks).toHaveLength(1);
    expect(json.tracks[0].notes).toHaveLength(2);
    void calls;
  });

  it.each([
    ['hỏng (magic bytes đúng nhưng nội dung rác)', corruptMidi()],
    ['không có track nào', midiWithNoTracks()],
  ])('%s -> MidiProcessingError, không ghi object nào', async (_label, buffer) => {
    const { storage, calls } = fakeStorage();
    const media = new SheetMediaService(undefined as never, storage);
    const err = await media.storeMidi(SHEET_ID, { buffer, originalName: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MidiProcessingError);
    expect((err as MidiProcessingError).reason).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('ghi note-JSON lỗi (S3) sau khi đã ghi file gốc -> StorageWriteError kèm cả hai key', async () => {
    const { storage } = fakeStorage({ on: 'public', nth: 1 });
    const media = new SheetMediaService(undefined as never, storage);
    const err = await media.storeMidi(SHEET_ID, { buffer: makeMidi(1), originalName: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageWriteError);
    expect((err as StorageWriteError).keys).toHaveLength(2);
    expect((err as StorageWriteError).keys[0]).toMatch(/\.mid$/);
    expect((err as StorageWriteError).keys[1]).toMatch(/\.json$/);
  });
});

describe('SheetMediaService.storeMp3', () => {
  it('ghi thẳng vào private, không parse/transcode', async () => {
    const { storage, calls } = fakeStorage();
    const media = new SheetMediaService(undefined as never, storage);
    const buffer = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x01, 0x02]);

    const result = await media.storeMp3(SHEET_ID, { buffer, originalName: 'demo.mp3' });

    expect(result.mp3).toMatchObject({ type: FileType.MP3, mimeType: 'audio/mpeg', size: buffer.length, originalName: 'demo.mp3' });
    expect(result.mp3.storageKey).toMatch(new RegExp(`^private/sheets/${SHEET_ID}/MP3/[0-9a-f]{64}\\.mp3$`));
    expect(result.keys).toEqual([result.mp3.storageKey]);
    expect(calls).toEqual([{ zone: 'private', key: result.mp3.storageKey, contentType: 'audio/mpeg' }]);
  });

  it('ghi lỗi (S3) -> StorageWriteError kèm key vừa ghi', async () => {
    const { storage } = fakeStorage({ on: 'private', nth: 1 });
    const media = new SheetMediaService(undefined as never, storage);
    const err = await media
      .storeMp3(SHEET_ID, { buffer: Buffer.from([0xff, 0xfb, 0x00]), originalName: null })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageWriteError);
    expect((err as StorageWriteError).keys).toHaveLength(1);
  });
});
