/** Address of a note in the score, as encoded in the `id` attributes written by `writeMusicXml(score, { ids: true })`. */
export interface NoteAddress {
  part: number;
  measure: number;
  voice: number;
  index: number;
  note: number;
}

export const noteId = (a: NoteAddress): string => `n_${a.part}_${a.measure}_${a.voice}_${a.index}_${a.note}`;

/** Parse an id made by `noteId` (an optional `_s<k>` suffix marks the extra pieces of a split event). */
export function parseNoteId(id: string): NoteAddress | undefined {
  const m = /^n_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)(?:_s\d+)?$/.exec(id);
  return m ? { part: +m[1], measure: +m[2], voice: +m[3], index: +m[4], note: +m[5] } : undefined;
}
