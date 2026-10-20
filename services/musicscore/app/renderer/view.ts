import { noteId, parseNoteId } from "../../src/model/noteid.ts";
import { clefAt, keyAt, type Clef, type Pitch } from "../../src/model/score.ts";
import { diatonicIndex, fromDiatonicIndex, keyAlter } from "../../src/model/pitch.ts";
import type { EventRef } from "../../src/edit/editor.ts";
import type { EditMethod } from "../shared.ts";
import * as A from "./actions.ts";
import { pitchName } from "./names.ts";
import { $, S, hooks, say } from "./state.ts";

const pages = $("pages");
const SVG_NS = "http://www.w3.org/2000/svg";
/** Extra room (in score units) around a note's hit area. A staff space is 180 units. */
const NOTE_PAD = 70;
const STAFF_PAD = 180;

// ---- drawing -----------------------------------------------------------------------

/** (part, staff) of each staff in drawing order, top to bottom. */
function staffOrder(): { part: number; staff: number }[] {
  return S.st.score.parts.flatMap((p, part) => Array.from({ length: p.staves }, (_, i) => ({ part, staff: i + 1 })));
}

/** Font rules already installed in <head>, so each is parsed and loaded once however often the score is redrawn. */
const installedFonts = new Set<string>();
const fontStyle = document.head.appendChild(document.createElement("style"));

/**
 * Verovio embeds its music font (about 100 KB of base64) in every page it draws. Redrawing the page on each edit
 * made the browser re-parse and re-load that font every time, which was slow and could stall font loading.
 * Move the @font-face rules into the document once and drop them from the page.
 */
function hoistFonts(svg: string): string {
  return svg.replace(/@font-face\s*\{[^}]*\}/g, (rule) => {
    if (!installedFonts.has(rule)) {
      installedFonts.add(rule);
      fontStyle.append(rule);
    }
    return "";
  });
}

function render(): void {
  pages.innerHTML = S.st.pages.map((svg) => `<div class="page">${hoistFonts(svg)}</div>`).join("");
  const order = staffOrder();

  // Verovio draws every measure as a group holding one group per staff. Give each staff of each measure a
  // transparent hit area so a click anywhere in it can be turned into "this measure, this staff".
  pages.querySelectorAll<SVGGElement>("g.measure").forEach((m, mi) => {
    m.dataset.measure = String(mi);
    m.querySelectorAll<SVGGElement>(":scope > g.staff").forEach((g, si) => {
      const target = order[si];
      if (!target) return;
      g.dataset.measure = String(mi);
      g.dataset.part = String(target.part);
      g.dataset.staff = String(target.staff);
      const b = g.getBBox();
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "shit");
      rect.setAttribute("x", String(b.x));
      rect.setAttribute("y", String(b.y - STAFF_PAD));
      rect.setAttribute("width", String(b.width));
      rect.setAttribute("height", String(b.height + 2 * STAFF_PAD));
      g.insertBefore(rect, g.firstChild);
    });
  });

  // Same for each note and rest: the glyph itself is a thin target (the middle of a quarter note is empty space).
  pages.querySelectorAll<SVGGElement>("g.note, g.rest, g.mRest").forEach((g) => {
    const b = g.getBBox();
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("class", "nhit");
    rect.setAttribute("x", String(b.x - NOTE_PAD));
    rect.setAttribute("y", String(b.y - NOTE_PAD));
    rect.setAttribute("width", String(b.width + 2 * NOTE_PAD));
    rect.setAttribute("height", String(b.height + 2 * NOTE_PAD));
    g.insertBefore(rect, g.firstChild);
  });

  $("btn-undo").toggleAttribute("disabled", !S.st.canUndo);
  $("btn-redo").toggleAttribute("disabled", !S.st.canRedo);
  document.title = `${S.st.dirty ? "• " : ""}${S.st.score.title || "Không tên"} — music-core`;
  refreshSelection(false);
  hooks.renderPanels();
}

function refreshSelection(scroll = false): void {
  pages.querySelectorAll(".sel, .cur").forEach((e) => e.classList.remove("sel", "cur"));
  pages.classList.toggle("input-mode", S.inputMode);

  // Selected measures: the staff areas they cover.
  const m = S.measures;
  pages.querySelectorAll<SVGGElement>("g.staff[data-measure]").forEach((g) => {
    const mi = Number(g.dataset.measure);
    const part = Number(g.dataset.part);
    const staff = Number(g.dataset.staff);
    if (m && part === m.part && staff >= m.staffFrom && staff <= m.staffTo && mi >= m.from && mi <= m.to) g.querySelector("rect.shit")?.classList.add("sel");
    else if (!m && mi === S.selMeasure && (!S.cursor || (S.cursor.part === part && staffOf(S.cursor) === staff))) g.querySelector("rect.shit")?.classList.add("cur");
  });

  for (const ref of S.refs) {
    const ev = A.eventOf(ref);
    if (!ev) continue;
    const count = ev.kind === "chord" ? ev.notes.length : 1;
    for (let n = 0; n < count; n++) document.getElementById(noteId({ ...ref, note: n }))?.classList.add("sel");
  }
  if (scroll && S.cursor) {
    document.getElementById(noteId(S.cursor))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  updatePosition();
}

const staffOf = (r: EventRef): number => A.voiceOf(r)?.staff ?? 1;

function updatePosition(): void {
  const s = S.st.score;
  const page = S.st.pageStarts.filter((p) => p <= S.selMeasure).length;
  const count = S.refs.length > 1 ? ` · ${S.refs.length} đối tượng` : "";
  const mode = S.inputMode ? " · NHẬP NỐT" : "";
  $("status-pos").textContent = `Ô nhịp ${S.selMeasure + 1}/${s.timeline.length} · Trang ${page}/${S.st.pages.length}${count}${mode}`;
}

hooks.render = render;
hooks.refreshSelection = refreshSelection;

/** Highlight the measure being played (or clear it with null). */
export function highlightPlaying(measure: number | null): void {
  pages.querySelectorAll(".play").forEach((e) => e.classList.remove("play"));
  if (measure === null) return;
  const hit = pages.querySelectorAll<SVGRectElement>(`g.staff[data-measure="${measure}"] rect.shit`);
  hit.forEach((r) => r.classList.add("play"));
  hit[0]?.scrollIntoView({ block: "nearest", behavior: "auto" });
}

// ---- geometry of a staff on screen ------------------------------------------------------

interface StaffGeometry {
  /** Client y of each of the five lines, top to bottom. */
  lines: number[];
  /** Distance between lines in pixels. */
  space: number;
}

function staffGeometry(staffG: Element): StaffGeometry | null {
  const lines = [...staffG.children].filter((c) => c.tagName === "path").slice(0, 5);
  if (lines.length < 5) return null;
  const ys = lines.map((l) => {
    const r = l.getBoundingClientRect();
    return (r.top + r.bottom) / 2;
  });
  return { lines: ys, space: (ys[4] - ys[0]) / 4 };
}

/** Diatonic index (see `diatonicIndex`) of the bottom staff line for a clef. */
function bottomLine(clef: Clef): number {
  const base = clef.sign === "F" ? 18 : clef.sign === "C" ? (clef.line === 4 ? 22 : 24) : 30;
  return base + (clef.octaveChange ?? 0) * 7;
}

function pitchAt(staffG: HTMLElement, clientY: number) {
  const geo = staffGeometry(staffG);
  if (!geo) return null;
  const part = Number(staffG.dataset.part);
  const staff = Number(staffG.dataset.staff);
  const measure = Number(staffG.dataset.measure);
  const clef = clefAt(S.st.score.parts[part], staff, measure);
  const steps = Math.round((geo.lines[4] - clientY) / (geo.space / 2));
  const index = bottomLine(clef) + Math.max(-14, Math.min(26, steps));
  const step = fromDiatonicIndex(index, 0).step;
  return fromDiatonicIndex(index, keyAlter(keyAt(S.st.score, measure).fifths, step));
}

/** The note, rest or measure rest of the staff nearest to a screen x. */
function nearestEvent(staffG: HTMLElement, clientX: number): EventRef | null {
  let best: { ref: EventRef; d: number } | null = null;
  staffG.querySelectorAll<SVGGElement>("g.note, g.rest, g.mRest").forEach((g) => {
    const id = parseNoteId(g.id);
    if (!id) return;
    const r = g.querySelector("rect.nhit")?.getBoundingClientRect() ?? g.getBoundingClientRect();
    const d = Math.abs((r.left + r.right) / 2 - clientX);
    if (!best || d < best.d) best = { ref: { part: id.part, measure: id.measure, voice: id.voice, index: id.index }, d };
  });
  return (best as { ref: EventRef } | null)?.ref ?? null;
}

// ---- mouse ------------------------------------------------------------------------------

const ghost = $("ghost");
const band = $("band");

type Gesture =
  | { kind: "note"; id: ReturnType<typeof parseNoteId> & object; x: number; y: number; moved: boolean; collapse: boolean; drag?: DragState }
  | { kind: "area"; x: number; y: number; moved: boolean; staffG: HTMLElement | null; additive: boolean; extend: boolean };

interface DragState {
  targets: { ref: EventRef; note: number; el: Element | null }[];
  space: number;
  unitsPerPx: number;
  steps: number;
  anchorPitch: Pitch;
}

let gesture: Gesture | null = null;

pages.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const t = e.target as Element;
  const noteEl = t.closest("g.note, g.rest, g.mRest");
  const id = noteEl ? parseNoteId(noteEl.id) : undefined;
  const staffG = (t.closest("g.staff[data-measure]") as HTMLElement | null) ?? null;
  pages.setPointerCapture(e.pointerId);

  if (id) {
    const ref: EventRef = { part: id.part, measure: id.measure, voice: id.voice, index: id.index };
    if (S.inputMode) {
      // A rest is an empty slot: clicking it writes a note there. Clicking a note just moves the cursor to it.
      if (A.eventOf(ref)?.kind === "rest" && staffG) return void placeNoteAt(staffG, e.clientX, e.clientY, ref);
      return void A.selectEvent(ref, id.note);
    }
    const inSelection = S.refs.some((r) => A.sameRef(r, ref));
    let collapse = false;
    if (e.shiftKey) A.extendToEvent(ref);
    else if (e.ctrlKey || e.metaKey) A.toggleEvent(ref, id.note);
    else if (inSelection && S.refs.length > 1) collapse = true; // may be the start of dragging the whole group
    else A.selectEvent(ref, id.note);
    gesture = { kind: "note", id, x: e.clientX, y: e.clientY, moved: false, collapse };
    return;
  }

  if (S.inputMode && staffG) return void placeNoteAt(staffG, e.clientX, e.clientY);
  gesture = { kind: "area", x: e.clientX, y: e.clientY, moved: false, staffG, additive: e.ctrlKey || e.metaKey, extend: e.shiftKey };
});

pages.addEventListener("pointermove", (e) => {
  if (S.inputMode) return showGhost(e);
  if (!gesture) return;
  const dx = e.clientX - gesture.x;
  const dy = e.clientY - gesture.y;
  if (!gesture.moved && Math.hypot(dx, dy) < 5) return;

  if (gesture.kind === "note") {
    if (!gesture.drag) {
      gesture.drag = beginPitchDrag(gesture.id!);
      if (!gesture.drag) return;
    }
    gesture.moved = true;
    updatePitchDrag(gesture.drag, dy);
    return;
  }

  gesture.moved = true;
  const x = Math.min(gesture.x, e.clientX);
  const y = Math.min(gesture.y, e.clientY);
  Object.assign(band.style, { display: "block", left: `${x}px`, top: `${y}px`, width: `${Math.abs(dx)}px`, height: `${Math.abs(dy)}px` });
});

pages.addEventListener("pointerup", (e) => {
  const g = gesture;
  gesture = null;
  band.style.display = "none";
  ghost.style.display = S.inputMode ? ghost.style.display : "none";
  if (!g) return;

  if (g.kind === "note") {
    if (g.drag) return void commitPitchDrag(g.drag);
    if (g.collapse) {
      const id = g.id!;
      A.selectEvent({ part: id.part, measure: id.measure, voice: id.voice, index: id.index }, id.note);
    }
    return;
  }

  if (g.moved) return void selectInBand(g, e);
  // A plain click on empty staff space selects that measure; elsewhere it clears the selection.
  if (g.staffG) {
    const m = Number(g.staffG.dataset.measure);
    const part = Number(g.staffG.dataset.part);
    const staff = Number(g.staffG.dataset.staff);
    if (g.extend) A.extendToMeasure(m, part, staff);
    else A.selectMeasures(m, m, part, staff);
  } else if (!g.additive) A.clearSelection();
});

pages.addEventListener("pointerleave", () => {
  if (S.inputMode) ghost.style.display = "none";
});

/** Rubber band: every note and rest the rectangle touches. */
function selectInBand(g: Extract<Gesture, { kind: "area" }>, e: PointerEvent): void {
  const left = Math.min(g.x, e.clientX);
  const right = Math.max(g.x, e.clientX);
  const top = Math.min(g.y, e.clientY);
  const bottom = Math.max(g.y, e.clientY);
  const refs: EventRef[] = [];
  pages.querySelectorAll<SVGGElement>("g.note, g.rest, g.mRest").forEach((el) => {
    const id = parseNoteId(el.id);
    const hit = el.querySelector("rect.nhit");
    if (!id || !hit) return;
    const r = hit.getBoundingClientRect();
    const scale = (hit as SVGGraphicsElement).getScreenCTM()?.a ?? 1;
    const pad = NOTE_PAD * scale; // judge by the glyph, not by its padded hit area
    if (r.right - pad > left && r.left + pad < right && r.bottom - pad > top && r.top + pad < bottom) {
      refs.push({ part: id.part, measure: id.measure, voice: id.voice, index: id.index });
    }
  });
  A.selectRefs(refs, g.additive || g.extend);
}

// ---- dragging a note up or down to change its pitch -------------------------------------

function beginPitchDrag(id: NonNullable<ReturnType<typeof parseNoteId>>): DragState | undefined {
  const ref: EventRef = { part: id.part, measure: id.measure, voice: id.voice, index: id.index };
  const ev = A.eventOf(ref);
  if (ev?.kind !== "chord") return undefined;

  // Dragging a note that is part of a bigger selection moves the whole selection; otherwise just that note.
  let targets = A.pitchTargets().map((t) => ({ ref: t.ref, note: t.note, el: document.getElementById(noteId({ ...t.ref, note: t.note })) }));
  if (!targets.some((t) => A.sameRef(t.ref, ref) && t.note === id.note)) {
    A.selectEvent(ref, id.note);
    targets = [{ ref, note: id.note, el: document.getElementById(noteId({ ...ref, note: id.note })) }];
  }
  const el = document.getElementById(noteId({ ...ref, note: id.note }));
  const staffG = el?.closest("g.staff");
  const geo = staffG ? staffGeometry(staffG) : null;
  const ctm = (el as unknown as SVGGraphicsElement | null)?.getScreenCTM();
  if (!geo || !ctm) return undefined;
  return { targets, space: geo.space, unitsPerPx: 1 / ctm.d, steps: 0, anchorPitch: ev.notes[id.note].pitch };
}

function updatePitchDrag(d: DragState, dy: number): void {
  const half = d.space / 2;
  d.steps = Math.round(-dy / half);
  // Slide the notes in whole steps, so they sit on the lines and spaces they will land on.
  const shiftUnits = -d.steps * half * d.unitsPerPx;
  for (const t of d.targets) t.el?.setAttribute("transform", `translate(0 ${shiftUnits})`);
  const base = d.anchorPitch;
  const moved = fromDiatonicIndex(diatonicIndex(base) + d.steps, base.alter);
  ghost.textContent = `${pitchName(moved)}${d.steps ? `  (${d.steps > 0 ? "+" : ""}${d.steps})` : ""}`;
  Object.assign(ghost.style, { display: "block", left: `${lastMouse.x + 16}px`, top: `${lastMouse.y - 28}px` });
}

function commitPitchDrag(d: DragState): void {
  for (const t of d.targets) t.el?.removeAttribute("transform");
  ghost.style.display = "none";
  if (d.steps === 0) return;
  const ops: [EditMethod, ...unknown[]][] = [];
  for (const t of d.targets) {
    const ev = A.eventOf(t.ref);
    if (ev?.kind !== "chord") continue;
    const p = ev.notes[t.note].pitch;
    const index = diatonicIndex(p) + d.steps;
    const step = fromDiatonicIndex(index, 0).step;
    ops.push(["setPitch", t.ref, t.note, fromDiatonicIndex(index, keyAlter(keyAt(S.st.score, t.ref.measure).fifths, step))]);
  }
  void A.editBatch(ops);
}

const lastMouse = { x: 0, y: 0 };
document.addEventListener("pointermove", (e) => {
  lastMouse.x = e.clientX;
  lastMouse.y = e.clientY;
});

// ---- note input mode: click the staff to place a note --------------------------------------

function showGhost(e: PointerEvent): void {
  const staffG = (e.target as Element).closest("g.staff[data-measure]") as HTMLElement | null;
  const p = staffG ? pitchAt(staffG, e.clientY) : null;
  if (!p) {
    ghost.style.display = "none";
    return;
  }
  ghost.textContent = pitchName(p);
  Object.assign(ghost.style, { display: "block", left: `${e.clientX + 14}px`, top: `${e.clientY - 26}px` });
}

async function placeNoteAt(staffG: HTMLElement, clientX: number, clientY: number, target?: EventRef): Promise<void> {
  const pitch = pitchAt(staffG, clientY);
  const ref = target ?? nearestEvent(staffG, clientX);
  if (!pitch || !ref) return void say("Không tìm thấy chỗ để đặt nốt ở ô nhịp này", true);
  await A.putPitchAt(ref, pitch);
}

/** Switch note-input mode on or off. */
export function setInputMode(on: boolean): void {
  S.inputMode = on;
  $("btn-input").classList.toggle("active", on);
  if (!on) ghost.style.display = "none";
  if (on && !S.cursor) A.selectEvent({ part: 0, measure: S.selMeasure, voice: 0, index: 0 }, 0, true);
  refreshSelection(false);
  say(on ? "Chế độ nhập nốt: bấm lên khuông để đặt nốt (N hoặc Esc để thoát)" : "");
}
