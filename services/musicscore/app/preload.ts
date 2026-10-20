import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Api } from "./shared.ts";

// Only these calls cross into the main process; the renderer gets no Node access.
const api: Api = {
  newDoc: () => ipcRenderer.invoke("newDoc"),
  open: (path) => ipcRenderer.invoke("open", path),
  loadExample: () => ipcRenderer.invoke("loadExample"),
  save: (saveAs) => ipcRenderer.invoke("save", saveAs),
  exportMidi: () => ipcRenderer.invoke("exportMidi"),
  exportPdf: () => ipcRenderer.invoke("exportPdf"),
  edit: (method, ...args) => ipcRenderer.invoke("edit", method, ...args),
  batch: (ops) => ipcRenderer.invoke("batch", ops),
  undo: () => ipcRenderer.invoke("undo"),
  redo: () => ipcRenderer.invoke("redo"),
  setStaffSize: (mm) => ipcRenderer.invoke("setStaffSize", mm),
  search: (text) => ipcRenderer.invoke("search", text),
  playback: () => ipcRenderer.invoke("playback"),
  pickAudiveris: () => ipcRenderer.invoke("pickAudiveris"),
  startupFile: () => ipcRenderer.invoke("startupFile"),
  toggleDevTools: () => ipcRenderer.send("toggleDevTools"),
  onMenu: (callback) => {
    ipcRenderer.on("menu", (_event, command: string) => callback(command));
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld("api", api);
