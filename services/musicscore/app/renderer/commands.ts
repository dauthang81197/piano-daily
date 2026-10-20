import type { DocState, Result } from "../shared.ts";
import * as A from "./actions.ts";
import { stopPlay } from "./playback.ts";
import { S, api, busy, hooks, say, $ } from "./state.ts";

export async function doSave(saveAs: boolean): Promise<void> {
  const r = await api.save(saveAs);
  if (A.apply(r)) say(`Đã lưu: ${S.st.path}`);
}

async function importWith(run: () => Promise<Result<DocState>>, message: string): Promise<void> {
  stopPlay();
  busy(message);
  try {
    const r = await run();
    if (!r.ok && r.code === "NO_AUDIVERIS") {
      busy(null);
      if (confirm("Chưa tìm thấy Audiveris (phần mềm nhận dạng nhạc từ PDF).\n\nBạn đã cài Audiveris chưa? Bấm OK để chọn file Audiveris.exe.")) {
        const picked = await api.pickAudiveris();
        if (picked.ok) return importWith(run, message);
      }
      say(r.error, true);
      return;
    }
    if (A.apply(r)) {
      S.cursor = null;
      S.refs = [];
      S.measures = null;
      S.selMeasure = 0;
      hooks.render();
      say(S.st.warnings.length ? "Đã nhập. Có vài thứ chưa nhận dạng được (xem bảng bên phải)." : "Đã mở bản nhạc");
    }
  } finally {
    busy(null);
  }
}

export const doOpen = (path?: string) =>
  importWith(() => api.open(path), path && /\.(pdf|png|jpe?g|tiff?|bmp)$/i.test(path) ? "Đang nhận dạng bản nhạc… (có thể mất vài chục giây)" : "Đang mở…");

export const doNew = () => importWith(() => api.newDoc(), "Đang tạo…");
export const doExample = () => importWith(() => api.loadExample(), "Đang mở ví dụ…");

export async function doExportMidi(): Promise<void> {
  const r = await api.exportMidi();
  if (r.ok) say(`Đã xuất MIDI: ${r.value}`);
  else if (r.code !== "CANCELLED") say(r.error, true);
}

export async function doExportPdf(): Promise<void> {
  busy("Đang tạo PDF…");
  try {
    const r = await api.exportPdf();
    if (r.ok) say(`Đã xuất PDF: ${r.value}`);
    else if (r.code !== "CANCELLED") say(r.error, true);
  } finally {
    busy(null);
  }
}

// Screen zoom: the page's width on screen. The engraving size itself is the "Cỡ khuông" setting.
let pageWidth = Number(localStorage.getItem("pageWidth")) || 900;
export function zoom(factor: number): void {
  pageWidth = Math.round(Math.min(2200, Math.max(450, pageWidth * factor)));
  document.documentElement.style.setProperty("--page-w", `${pageWidth}px`);
  $("zoom-label").textContent = `${Math.round((pageWidth / 900) * 100)}%`;
  try {
    localStorage.setItem("pageWidth", String(pageWidth));
  } catch {
    /* storage may be unavailable; the zoom just is not remembered */
  }
}
