// Types shared by the main process, the preload script and the renderer.
import type { Score } from "../src/model/score.ts";

export interface DocState {
  /** One SVG string per page; notes carry ids that `parseNoteId` decodes. */
  pages: string[];
  /** First measure (0-based) on each page, for page search. */
  pageStarts: number[];
  score: Score;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  /** Path of the file the score came from or was last saved to, if any. */
  path: string | null;
  /** Notation the importer could not represent. */
  warnings: string[];
  /** Number of structural problems found by validateScore (e.g. a pickup measure or misread rhythm). */
  issues: number;
  staffMm: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: "NO_AUDIVERIS" | "CANCELLED" };

/** Editor methods the UI may call. Anything else is refused by the main process. */
export const EDIT_METHODS = [
  "setDynamic",
  "toggleArticulation",
  "toggleFermata",
  "setLyric",
  "addSlur",
  "removeSlur",
  "setRepeat",
  "setVolta",
  "createTuplet",
  "removeTuplet",
  "deleteEvents",
  "paste",
  "setTitle",
  "setPitch",
  "addNote",
  "deleteNote",
  "deleteEvent",
  "putNote",
  "setDuration",
  "toggleTie",
  "transposeRange",
  "transposeScore",
  "insertMeasures",
  "deleteMeasures",
  "clearMeasures",
  "setTimeSignature",
  "setKeySignature",
  "setTempo",
  "setClef",
  "setRehearsalMark",
  "addPart",
  "removePart",
  "renamePart",
  "setInstrument",
  "setStaves",
] as const;
export type EditMethod = (typeof EDIT_METHODS)[number];

export interface PlaybackNote {
  part: number;
  start: number;
  end: number;
  midi: number;
  /** MIDI velocity 1-127 (dynamics, accents). */
  velocity: number;
  /** General MIDI program of the part. */
  program: number;
}

export interface Api {
  /** Start a new empty score. */
  newDoc(): Promise<Result<DocState>>;
  /** Open a score. Without a path, shows the file dialog. PDF/images go through Audiveris. */
  open(path?: string): Promise<Result<DocState>>;
  loadExample(): Promise<Result<DocState>>;
  save(saveAs: boolean): Promise<Result<DocState>>;
  exportMidi(): Promise<Result<string>>;
  exportPdf(): Promise<Result<string>>;
  edit(method: EditMethod, ...args: unknown[]): Promise<Result<DocState>>;
  /** Several edits as one undo step; if any fails none is applied. */
  batch(ops: [EditMethod, ...unknown[]][]): Promise<Result<DocState>>;
  undo(): Promise<Result<DocState>>;
  redo(): Promise<Result<DocState>>;
  setStaffSize(mm: number): Promise<Result<DocState>>;
  search(text: string): Promise<Result<import("../src/search/search.ts").SearchHit[]>>;
  playback(): Promise<Result<{ notes: PlaybackNote[]; seconds: number; measures: { measure: number; start: number; end: number }[] }>>;
  pickAudiveris(): Promise<Result<string>>;
  /** File given on the command line (`electron . score.pdf`), if any. */
  startupFile(): Promise<Result<string | null>>;
  toggleDevTools(): void;
  /** Commands from the macOS menu bar ("undo", "save", "zoomIn", ...). */
  onMenu(callback: (command: string) => void): void;
  /** Real path of a dropped file. */
  pathForFile(file: File): string;
}
