// Public API of music-core.

export * from "./model/score.ts";
export * from "./model/pitch.ts";
export { validateScore, type ScoreIssue } from "./model/validate.ts";

export { readMusicXml, type ReadResult } from "./musicxml/read.ts";
export { writeMusicXml, type WriteOptions } from "./musicxml/write.ts";
export { noteId, parseNoteId, type NoteAddress } from "./model/noteid.ts";

export { Editor, EditError, type EventRef, type MeasureRange, type NewPart } from "./edit/editor.ts";

export { writeMidi, type MidiOptions } from "./midi/write.ts";
export { soundingNotes, tickToSeconds, playOrder, timeline, type SoundingNote, type TimelineStep } from "./midi/notes.ts";
export { copyClip, eventsInSpan, eventStart, locateTick, measureSpan, compareRefs, type Clip, type ClipItem, type Span } from "./edit/selection.ts";
export { renderPdf, renderSvg, pageStarts, type RenderOptions } from "./render/render.ts";

export { recognizeScore, OmrError, type OmrOptions, type OmrResult } from "./omr/audiveris.ts";

export { parseSearch, type SearchCommand } from "./search/parser.ts";
export { search, type SearchHit, type SearchContext } from "./search/search.ts";
