import * as A from "./actions.ts";
import { doExportMidi, doExportPdf, doNew, doOpen, doSave, zoom } from "./commands.ts";
import { DURATION_KEYS } from "./names.ts";
import { togglePlay } from "./playback.ts";
import { $, S, api } from "./state.ts";
import { setInputMode } from "./view.ts";

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

/**
 * Commands that arrive from the macOS menu bar instead of from a key press (there the menu owns the shortcut).
 * They do what the same keys do below.
 */
export function runCommand(name: string): void {
  switch (name) {
    case "undo": return void A.doUndo();
    case "redo": return void A.doRedo();
    case "cut": return A.cutSelection();
    case "copy": return void A.copySelection();
    case "paste": return A.pasteClipboard();
    case "selectAll": return A.selectAll();
    case "new": return void doNew();
    case "open": return void doOpen();
    case "save": return void doSave(false);
    case "saveAs": return void doSave(true);
    case "exportMidi": return void doExportMidi();
    case "exportPdf": return void doExportPdf();
    case "find": return $("search").focus();
    case "zoomIn": return zoom(1.15);
    case "zoomOut": return zoom(1 / 1.15);
    case "help": $("help").hidden = !$("help").hidden;
  }
}

/** Run a handler and swallow the browser's own reaction to the key. */
const handled = (e: KeyboardEvent, fn: () => unknown): void => {
  e.preventDefault();
  void fn();
};

document.addEventListener("keydown", (e) => {
  if (e.key === "F1") return handled(e, () => ($("help").hidden = !$("help").hidden));
  if (e.key === "F12") return void api.toggleDevTools();
  if (e.key === "Escape") {
    $("help").hidden = true;
    if (isTyping(e.target)) (e.target as HTMLElement).blur();
    else if (S.inputMode) setInputMode(false);
    else A.clearSelection();
    return;
  }
  if (isTyping(e.target)) return;

  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key;

  if (ctrl) {
    const k = key.toLowerCase();
    if (k === "z") return handled(e, e.shiftKey ? A.doRedo : A.doUndo);
    if (k === "y") return handled(e, A.doRedo);
    if (k === "s") return handled(e, () => doSave(e.shiftKey));
    if (k === "o") return handled(e, () => doOpen());
    if (k === "f") return handled(e, () => $("search").focus());
    if (k === "a") return handled(e, A.selectAll);
    if (k === "c") return handled(e, A.copySelection);
    if (k === "x") return handled(e, A.cutSelection);
    if (k === "v") return handled(e, A.pasteClipboard);
    if (k === "l") return handled(e, () => $("lyric-input").focus());
    if (key === "3") return handled(e, () => A.makeTuplet(3, 2));
    if (key === "=" || key === "+") return handled(e, () => zoom(1.15));
    if (key === "-") return handled(e, () => zoom(1 / 1.15));
    if (key === "ArrowUp") return handled(e, () => A.nudge(12));
    if (key === "ArrowDown") return handled(e, () => A.nudge(-12));
    return;
  }

  if (/^[a-gA-G]$/.test(key)) return handled(e, () => A.typeLetter(key, e.shiftKey));
  const d = DURATION_KEYS.find((x) => x.key === key);
  if (d) return handled(e, () => A.setDuration(d.type));

  switch (key) {
    case ".": return handled(e, A.toggleDot);
    case "0": return handled(e, A.makeRest);
    case "t": case "T": return handled(e, A.toggleTie);
    case "s": case "S": return handled(e, A.toggleSlur);
    case "n": case "N": return handled(e, () => setInputMode(!S.inputMode));
    case "Delete": case "Backspace": return handled(e, A.deleteSelected);
    case "ArrowUp": return handled(e, () => A.nudge(1));
    case "ArrowDown": return handled(e, () => A.nudge(-1));
    case " ": return handled(e, togglePlay);
    case "ArrowRight": case "ArrowLeft": {
      const forward = key === "ArrowRight";
      if (e.shiftKey) return handled(e, () => A.extendByArrow(forward));
      return handled(e, () => {
        if (!S.cursor) return A.selectEvent({ part: 0, measure: S.selMeasure, voice: 0, index: 0 }, 0, true);
        const n = forward ? A.nextRef(S.cursor) : A.prevRef(S.cursor);
        if (n) A.selectEvent(n, 0, true);
      });
    }
  }
});
