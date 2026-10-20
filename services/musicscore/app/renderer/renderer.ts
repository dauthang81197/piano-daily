// Entry point: wires the toolbar, search box and drag-and-drop, then starts with an empty score.
import * as A from "./actions.ts";
import { doExample, doExportMidi, doExportPdf, doNew, doOpen, doSave, zoom } from "./commands.ts";
import { runCommand } from "./keys.ts";
import "./panels.ts";
import { togglePlay } from "./playback.ts";
import { $, S, api, isMac, keyHint, say } from "./state.ts";
import "./view.ts";

$("btn-new").addEventListener("click", () => void doNew());
$("btn-open").addEventListener("click", () => void doOpen());
$("btn-example").addEventListener("click", () => void doExample());
$("btn-save").addEventListener("click", () => void doSave(false));
$("btn-saveas").addEventListener("click", () => void doSave(true));
$("btn-midi").addEventListener("click", () => void doExportMidi());
$("btn-pdf").addEventListener("click", () => void doExportPdf());
$("btn-undo").addEventListener("click", () => void A.doUndo());
$("btn-redo").addEventListener("click", () => void A.doRedo());
$("btn-play").addEventListener("click", () => void togglePlay());
$("btn-zoom-in").addEventListener("click", () => zoom(1.15));
$("btn-zoom-out").addEventListener("click", () => zoom(1 / 1.15));
$("btn-help").addEventListener("click", () => ($("help").hidden = !$("help").hidden));
$("help").addEventListener("click", () => ($("help").hidden = true));
zoom(1);

if (isMac) {
  // The Command key stands in for Ctrl, so say so in the hints and the help.
  document.body.classList.add("mac");
  document.querySelectorAll<HTMLElement>("[title]").forEach((e) => (e.title = keyHint(e.title)));
  const search = $<HTMLInputElement>("search");
  search.placeholder = keyHint(search.placeholder);
  const walker = document.createTreeWalker($("help"), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) n.textContent = keyHint(n.textContent ?? "");
}
api.onMenu(runCommand);

// Find / Go to
$("search").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const input = e.target as HTMLInputElement;
  const r = await api.search(input.value);
  if (!r.ok) return say(r.error, true);
  const hit = r.value[0];
  if (!hit) return say("Không tìm thấy", true);
  say("");
  const part = 0;
  const staffTo = S.st.score.parts[part].staves;
  if (hit.kind === "measureRange") {
    A.selectMeasures(hit.from, hit.to, part, 1, staffTo);
    say(`Ô nhịp ${hit.from + 1}–${hit.to + 1}`);
    scrollToMeasure(hit.from);
    return;
  }
  const m = hit.kind === "page" ? hit.firstMeasure : hit.measure;
  A.selectMeasures(m, m, part, 1, staffTo);
  scrollToMeasure(m);
});

function scrollToMeasure(m: number): void {
  document.querySelector(`g.staff[data-measure="${m}"]`)?.scrollIntoView({ block: "center", inline: "nearest" });
}

// Dropping a file onto the window opens it.
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files[0];
  if (f) void doOpen(api.pathForFile(f));
});

void (async () => {
  const r = await api.newDoc();
  if (A.apply(r)) {
    A.selectEvent({ part: 0, measure: 0, voice: 0, index: 0 });
    say("Sẵn sàng. Chọn dấu lặng rồi gõ A–G để nhập nốt, hoặc bấm Mở… để nhập PDF.");
    const file = await api.startupFile();
    if (file.ok && file.value) await doOpen(file.value);
  }
})();
