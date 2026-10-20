import type { EventRef } from "../../src/edit/editor.ts";
import type { Clip } from "../../src/edit/selection.ts";
import type { Pitch } from "../../src/model/score.ts";
import type { Api, DocState } from "../shared.ts";

declare global {
  interface Window {
    api: Api;
  }
}

export const api = window.api;

/** True on a Mac, where the Command key does what Ctrl does elsewhere. */
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** Show "⌘" in place of "Ctrl" in a hint when running on a Mac. */
export const keyHint = (text: string): string => (isMac ? text.replace(/Ctrl ?\+ ?/g, "⌘").replace(/Ctrl/g, "⌘") : text);

/** The note the keyboard acts on: where the next key press lands. */
export interface Cursor extends EventRef {
  note: number;
}

/** Everything the UI remembers between renders. Changed through `actions.ts`. */
export const S = {
  st: undefined as unknown as DocState,
  /** The primary selected event (the "moving end" when a range is extended). */
  cursor: null as Cursor | null,
  /** Every selected event, in no particular order. The cursor's event is among them. */
  refs: [] as EventRef[],
  /** Whole measures of some staves selected (inclusive); null when the selection is made of notes. */
  measures: null as { from: number; to: number; part: number; staffFrom: number; staffTo: number } | null,
  /** The measure the properties panel talks about. */
  selMeasure: 0,
  /** The fixed end of a range: where Shift+click and Shift+arrows extend from. */
  anchor: null as { part: number; staff: number; start: number; end: number } | null,
  /** Length used for newly entered notes. */
  dur: { type: "quarter", dots: 0 } as { type: import("../../src/model/score.ts").NoteType; dots: number },
  lastPitch: { step: "B", alter: 0, octave: 4 } as Pitch,
  /** Note-input mode (key N): clicking the staff places a note. */
  inputMode: false,
  clipboard: null as Clip | null,
  verse: 1,
};

/** Hooks the view and panels register, so `actions.ts` can ask for a redraw without importing them (no cycles). */
export const hooks = {
  render: () => {},
  refreshSelection: (_scroll?: boolean) => {},
  renderPanels: () => {},
};

export const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Build a DOM element: `h("button", { onClick }, "text")`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "title") el.title = keyHint(String(v));
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export function say(msg: string, isError = false): void {
  const el = $("status-msg");
  el.textContent = msg;
  el.className = isError ? "error" : "";
}

let busyTimer = 0;

/**
 * Show the "working" overlay, but only if the work takes a moment, so quick actions do not flash it (and it is
 * not sitting behind a confirmation dialog the main process opens first).
 */
export function busy(msg: string | null): void {
  clearTimeout(busyTimer);
  if (msg === null) {
    $("busy").hidden = true;
    return;
  }
  $("busy-msg").textContent = msg;
  busyTimer = window.setTimeout(() => ($("busy").hidden = false), 300);
}
