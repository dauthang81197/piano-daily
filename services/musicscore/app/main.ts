import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import {
  Editor,
  OmrError,
  readMusicXml,
  recognizeScore,
  renderPdf,
  renderSvg,
  search,
  measureTicks,
  soundingNotes,
  tickToSeconds,
  timeline,
  validateScore,
  writeMidi,
  writeMusicXml,
  type Score,
} from "../src/index.ts";
import { twinkleScore } from "../src/fixtures.ts";
import { EDIT_METHODS, type DocState, type EditMethod, type PlaybackNote, type Result } from "./shared.ts";

const OMR_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"]);
const XML_EXTENSIONS = new Set([".musicxml", ".xml", ".mxl"]);

// ---- settings ---------------------------------------------------------------

interface Settings {
  audiveris?: string;
}

const settingsFile = () => join(app.getPath("userData"), "settings.json");

async function loadSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(settingsFile(), "utf8")) as Settings;
  } catch {
    return {};
  }
}

async function saveSettings(s: Settings): Promise<void> {
  await writeFile(settingsFile(), JSON.stringify(s, null, 2));
}

/** The program inside a macOS `Audiveris.app` bundle; any other path is already the program. */
function launcherFrom(path: string): string {
  return process.platform === "darwin" && path.endsWith(".app") ? join(path, "Contents", "MacOS", "Audiveris") : path;
}

/** Usual install locations of the Audiveris launcher on this system. */
function defaultAudiverisPaths(): (string | undefined)[] {
  switch (process.platform) {
    case "win32":
      return [
        "C:\\Program Files\\Audiveris\\Audiveris.exe",
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Audiveris", "Audiveris.exe"),
      ];
    case "darwin":
      return ["/Applications/Audiveris.app/Contents/MacOS/Audiveris", join(app.getPath("home"), "Applications", "Audiveris.app", "Contents", "MacOS", "Audiveris")];
    default:
      return ["/opt/audiveris/bin/Audiveris", "/usr/local/bin/audiveris", "/usr/bin/audiveris"];
  }
}

/** Where Audiveris is: saved setting, AUDIVERIS env var, then the usual install locations. */
async function findAudiveris(): Promise<string | undefined> {
  const saved = (await loadSettings()).audiveris;
  const candidates = [saved, process.env.AUDIVERIS, ...defaultAudiverisPaths()];
  return candidates.map((c) => c && launcherFrom(c)).find((c): c is string => !!c && existsSync(c));
}

// ---- the open document --------------------------------------------------------

class Doc {
  editor: Editor;
  path: string | null;
  dirty = false;
  warnings: string[];
  staffMm = 7.2;
  /** First measure of each page in the last rendered state, for page search. */
  pageStarts: number[] = [];

  constructor(score: Score, path: string | null = null, warnings: string[] = [], dirty = false) {
    this.editor = new Editor(score);
    this.path = path;
    this.warnings = warnings;
    this.dirty = dirty;
  }

  async state(): Promise<DocState> {
    const score = this.editor.score;
    const pages = await renderSvg(score, { noteIds: true, staffHeightMm: this.staffMm });
    let seen = 0;
    this.pageStarts = pages.map((svg) => {
      const start = seen;
      seen += svg.match(/class="measure"/g)?.length ?? 0;
      return start;
    });
    return {
      pages,
      pageStarts: this.pageStarts,
      score,
      canUndo: this.editor.canUndo,
      canRedo: this.editor.canRedo,
      dirty: this.dirty,
      path: this.path,
      warnings: this.warnings,
      issues: validateScore(score).length,
      staffMm: this.staffMm,
    };
  }
}

function emptyScore(): Score {
  const score: Score = {
    title: "Không tên",
    timeline: Array.from({ length: 8 }, (_, i) =>
      i === 0 ? { time: { beats: 4, beatType: 4 }, key: { fifths: 0, mode: "major" as const }, tempo: 100 } : {},
    ),
    parts: [],
  };
  new Editor(score).addPart({ name: "Piano", midiProgram: 0, staves: 2 });
  return score;
}

/** A score named on the command line, e.g. `electron . song.pdf` or "Open with" from Explorer. */
const startupFile = process.argv
  .slice(app.isPackaged ? 1 : 2)
  .find((a) => [...OMR_EXTENSIONS, ...XML_EXTENSIONS].includes(extname(a).toLowerCase()) && existsSync(a));

let doc = new Doc(emptyScore());
let win: BrowserWindow | null = null;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (e: unknown, code?: "NO_AUDIVERIS" | "CANCELLED"): Result<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
  ...(code ? { code } : {}),
});

/** Ask before throwing away unsaved edits. Returns false if the user cancels. */
async function confirmDiscard(): Promise<boolean> {
  if (!doc.dirty || !win) return true;
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    buttons: ["Bỏ thay đổi", "Huỷ"],
    defaultId: 1,
    cancelId: 1,
    message: "Bản nhạc có thay đổi chưa lưu.",
    detail: "Tiếp tục sẽ mất các thay đổi này.",
  });
  return response === 0;
}

async function openFile(path: string): Promise<Result<DocState>> {
  const ext = extname(path).toLowerCase();
  if (OMR_EXTENSIONS.has(ext)) {
    const executable = await findAudiveris();
    try {
      const r = await recognizeScore(path, executable ? { executable } : {});
      const warnings = [...r.warnings];
      if (r.scores.length > 1) warnings.push(`Audiveris tìm thấy ${r.scores.length} đoạn nhạc; chỉ mở đoạn đầu tiên.`);
      // Recognised music has no file of its own: the first save must ask where to put it.
      doc = new Doc(r.score, null, warnings, true);
    } catch (e) {
      if (e instanceof OmrError && e.message.startsWith("Could not start")) {
        return fail("Không tìm thấy Audiveris. Hãy chọn chương trình Audiveris đã cài.", "NO_AUDIVERIS");
      }
      return fail(e instanceof OmrError ? `${e.message}${e.log ? `\n\n${e.log.slice(-600)}` : ""}` : e);
    }
  } else if (XML_EXTENSIONS.has(ext)) {
    const r = readMusicXml(await readFile(path));
    doc = new Doc(r.score, path, r.warnings);
  } else {
    return fail(`Không hỗ trợ định dạng "${ext}". Dùng PDF, ảnh, hoặc MusicXML.`);
  }
  return ok(await doc.state());
}

async function saveTo(path: string): Promise<void> {
  await writeFile(path, writeMusicXml(doc.editor.score));
  doc.path = path;
  doc.dirty = false;
}

const defaultName = (ext: string): string => {
  const base = doc.path ? basename(doc.path, extname(doc.path)) : doc.editor.score.title || "bản nhạc";
  return `${base.replace(/[\\/:*?"<>|]/g, "_")}${ext}`;
};

const startDir = (): string => (doc.path ? dirname(doc.path) : app.getPath("documents"));

// ---- IPC --------------------------------------------------------------------

/** Run a handler, turning anything it throws into a failed Result the UI can show. */
function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<Result<T>> | Result<T>): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...(args as A));
    } catch (e) {
      return fail(e);
    }
  });
}

function registerIpc(): void {
  handle("newDoc", async () => {
    if (!(await confirmDiscard())) return fail("Đã huỷ", "CANCELLED");
    doc = new Doc(emptyScore());
    return ok(await doc.state());
  });

  handle("open", async (path?: string) => {
    if (!(await confirmDiscard())) return fail("Đã huỷ", "CANCELLED");
    let target = path;
    if (!target) {
      const r = await dialog.showOpenDialog(win!, {
        defaultPath: startDir(),
        properties: ["openFile"],
        filters: [
          { name: "Bản nhạc (PDF, ảnh, MusicXML)", extensions: ["pdf", "png", "jpg", "jpeg", "tif", "tiff", "musicxml", "xml", "mxl"] },
        ],
      });
      if (r.canceled || !r.filePaths[0]) return fail("Đã huỷ", "CANCELLED");
      target = r.filePaths[0];
    }
    return openFile(target);
  });

  handle("loadExample", async () => {
    if (!(await confirmDiscard())) return fail("Đã huỷ", "CANCELLED");
    doc = new Doc(twinkleScore());
    return ok(await doc.state());
  });

  handle("save", async (saveAs: boolean) => {
    let target = doc.path;
    if (!target || saveAs) {
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: join(startDir(), defaultName(".musicxml")),
        filters: [{ name: "MusicXML", extensions: ["musicxml"] }],
      });
      if (r.canceled || !r.filePath) return fail("Đã huỷ", "CANCELLED");
      target = r.filePath;
    }
    await saveTo(target);
    return ok(await doc.state());
  });

  handle("exportMidi", async () => {
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: join(startDir(), defaultName(".mid")),
      filters: [{ name: "MIDI", extensions: ["mid"] }],
    });
    if (r.canceled || !r.filePath) return fail("Đã huỷ", "CANCELLED");
    await writeFile(r.filePath, writeMidi(doc.editor.score));
    return ok(r.filePath);
  });

  handle("exportPdf", async () => {
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: join(startDir(), defaultName(".pdf")),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (r.canceled || !r.filePath) return fail("Đã huỷ", "CANCELLED");
    await writeFile(r.filePath, await renderPdf(doc.editor.score));
    return ok(r.filePath);
  });

  handle("edit", async (method: EditMethod, ...args: unknown[]) => {
    if (!(EDIT_METHODS as readonly string[]).includes(method)) return fail(`Thao tác không hợp lệ: ${String(method)}`);
    (doc.editor[method] as (...a: unknown[]) => unknown)(...args);
    doc.dirty = true;
    return ok(await doc.state());
  });

  handle("batch", async (ops: [EditMethod, ...unknown[]][]) => {
    if (!Array.isArray(ops) || ops.length === 0) return fail("Không có thao tác nào");
    for (const [method] of ops) {
      if (!(EDIT_METHODS as readonly string[]).includes(method)) return fail(`Thao tác không hợp lệ: ${String(method)}`);
    }
    doc.editor.batch((e) => {
      for (const [method, ...args] of ops) (e[method] as (...a: unknown[]) => unknown)(...args);
    });
    doc.dirty = true;
    return ok(await doc.state());
  });

  handle("undo", async () => {
    if (doc.editor.undo()) doc.dirty = true;
    return ok(await doc.state());
  });
  handle("redo", async () => {
    if (doc.editor.redo()) doc.dirty = true;
    return ok(await doc.state());
  });

  handle("setStaffSize", async (mm: number) => {
    if (!(mm >= 3 && mm <= 20)) return fail("Cỡ khuông phải từ 3 đến 20 mm");
    doc.staffMm = mm;
    return ok(await doc.state());
  });

  handle("search", (text: string) => ok(search(doc.editor.score, String(text), { pageStarts: doc.pageStarts })));

  handle("playback", () => {
    const score = doc.editor.score;
    const toSec = tickToSeconds(score);
    const notes: PlaybackNote[] = soundingNotes(score).map((n) => ({
      part: n.part,
      start: toSec(n.start),
      end: toSec(n.end),
      midi: n.midi,
      velocity: n.velocity,
      program: score.parts[n.part].midiProgram,
    }));
    const measures = timeline(score).map((step) => ({
      measure: step.measure,
      start: toSec(step.startTick),
      end: toSec(step.startTick + measureTicks(score, step.measure)),
    }));
    return ok({ notes, seconds: measures.at(-1)?.end ?? 0, measures });
  });

  handle("pickAudiveris", async () => {
    const mac = process.platform === "darwin";
    const r = await dialog.showOpenDialog(win!, {
      title: mac ? "Chọn Audiveris (trong thư mục Applications)" : "Chọn Audiveris",
      // On a Mac the program is inside Audiveris.app, which is a folder as far as the dialog is concerned.
      properties: mac ? ["openFile", "openDirectory"] : ["openFile"],
      ...(process.platform === "win32" ? { filters: [{ name: "Audiveris", extensions: ["exe", "bat", "cmd"] }] } : {}),
    });
    if (r.canceled || !r.filePaths[0]) return fail("Đã huỷ", "CANCELLED");
    const launcher = launcherFrom(r.filePaths[0]);
    if (!existsSync(launcher)) return fail(`Không tìm thấy chương trình Audiveris tại ${launcher}`);
    await saveSettings({ ...(await loadSettings()), audiveris: launcher });
    return ok(launcher);
  });

  handle("startupFile", () => ok(startupFile ?? null));

  ipcMain.on("toggleDevTools", () => win?.webContents.toggleDevTools());
}

// ---- window -------------------------------------------------------------------

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: "music-core",
    backgroundColor: "#1e1f22",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  void win.loadFile(join(import.meta.dirname, "renderer", "index.html"));

  win.on("close", (e) => {
    if (!doc.dirty || !win || process.env.MUSIC_CORE_TEST) return;
    e.preventDefault();
    void confirmDiscard().then((yes) => {
      if (yes) {
        doc.dirty = false;
        win?.close();
      }
    });
  });
  win.on("closed", () => (win = null));
}

/**
 * Run an editing command. In a text field it is the browser's own (so copy/paste work in the title box and
 * so on); anywhere else it is sent to the page, which applies it to the score.
 */
async function editCommand(name: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll"): Promise<void> {
  if (!win) return;
  const inField = await win.webContents.executeJavaScript(
    "(() => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName); })()",
  );
  if (inField) win.webContents[name]();
  else win.webContents.send("menu", name);
}

/** True when the macOS-style menu is wanted: on a Mac, or anywhere when MUSIC_CORE_MAC_MENU is set (for testing it). */
const useMacMenu = process.platform === "darwin" || !!process.env.MUSIC_CORE_MAC_MENU;

/**
 * macOS keeps one menu bar for the whole app and routes Cmd+C, Cmd+V and the like through it, so without a menu
 * they do nothing in text fields. Windows and Linux have no menu: the page handles every shortcut itself.
 */
function buildMacMenu(): Menu {
  const send = (command: string) => () => win?.webContents.send("menu", command);
  return Menu.buildFromTemplate([
    { role: "appMenu" },
    {
      label: "Tệp",
      submenu: [
        { id: "new", label: "Mới", accelerator: "Cmd+N", click: send("new") },
        { id: "open", label: "Mở…", accelerator: "Cmd+O", click: send("open") },
        { type: "separator" },
        { id: "save", label: "Lưu", accelerator: "Cmd+S", click: send("save") },
        { id: "saveAs", label: "Lưu thành…", accelerator: "Shift+Cmd+S", click: send("saveAs") },
        { type: "separator" },
        { id: "exportMidi", label: "Xuất MIDI…", click: send("exportMidi") },
        { id: "exportPdf", label: "Xuất PDF…", click: send("exportPdf") },
      ],
    },
    {
      label: "Chỉnh sửa",
      submenu: [
        { id: "undo", label: "Hoàn tác", accelerator: "Cmd+Z", click: () => void editCommand("undo") },
        { id: "redo", label: "Làm lại", accelerator: "Shift+Cmd+Z", click: () => void editCommand("redo") },
        { type: "separator" },
        { id: "cut", label: "Cắt", accelerator: "Cmd+X", click: () => void editCommand("cut") },
        { id: "copy", label: "Chép", accelerator: "Cmd+C", click: () => void editCommand("copy") },
        { id: "paste", label: "Dán", accelerator: "Cmd+V", click: () => void editCommand("paste") },
        { id: "selectAll", label: "Chọn tất cả", accelerator: "Cmd+A", click: () => void editCommand("selectAll") },
        { type: "separator" },
        { id: "find", label: "Tìm / Đi tới", accelerator: "Cmd+F", click: send("find") },
      ],
    },
    {
      label: "Xem",
      submenu: [
        { id: "zoomIn", label: "Phóng to", accelerator: "Cmd+=", click: send("zoomIn") },
        { id: "zoomOut", label: "Thu nhỏ", accelerator: "Cmd+-", click: send("zoomOut") },
        { id: "help", label: "Phím tắt", accelerator: "F1", click: send("help") },
        { type: "separator" },
        { label: "Công cụ nhà phát triển", accelerator: "Alt+Cmd+I", click: () => win?.webContents.toggleDevTools() },
      ],
    },
    { role: "windowMenu" },
  ]);
}

app.whenReady().then(() => {
  // Elsewhere shortcuts live in the renderer so they match the on-screen help.
  Menu.setApplicationMenu(useMacMenu ? buildMacMenu() : null);
  registerIpc();
  createWindow();
  // Clicking the Dock icon after the last window closed opens a fresh one.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// On a Mac, closing the last window leaves the app running in the Dock, as Mac apps do.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
