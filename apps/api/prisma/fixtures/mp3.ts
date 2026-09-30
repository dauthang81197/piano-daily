/**
 * Sinh MP3 mẫu bằng code (không commit file nhị phân): tag ID3v2.3 (khung TIT2 mang `label`, để mỗi Sheet
 * có hash khác nhau) rồi vài frame MPEG1 Layer III 128kbps/44.1kHz im lặng (payload toàn 0).
 */

/** 144 * 128000 / 44100 = 417 byte/frame (không padding). */
const FRAME_BYTES = 417;
const FRAME_HEADER = [0xff, 0xfb, 0x90, 0x00]; // MPEG1, Layer III, không CRC, 128kbps, 44.1kHz, stereo

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** Kích thước synchsafe (4 byte, 7 bit mỗi byte) của header ID3v2. */
function synchsafe(value: number): number[] {
  return [(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f];
}

export function makeMp3(label = 'fixture', frameCount = 8): Buffer {
  const text = Buffer.from(label, 'latin1');
  const body = Buffer.concat([Buffer.from([0x00]), text]); // encoding 0 = ISO-8859-1
  const tit2 = Buffer.concat([Buffer.from('TIT2', 'latin1'), Buffer.from(u32(body.length)), Buffer.from([0, 0]), body]);
  const tag = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]), Buffer.from(synchsafe(tit2.length)), tit2]);
  const frame = Buffer.concat([Buffer.from(FRAME_HEADER), Buffer.alloc(FRAME_BYTES - FRAME_HEADER.length)]);
  return Buffer.concat([tag, ...Array.from({ length: Math.max(1, frameCount) }, () => frame)]);
}
