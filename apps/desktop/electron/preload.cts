import { contextBridge } from "electron";

/**
 * Nothing exposed yet — the renderer talks to the Express API over HTTP,
 * it doesn't need Node/Electron APIs. This file exists so the
 * context-isolated bridge is in place before a real need (native file
 * dialogs, auto-update, OS notifications) shows up.
 */
contextBridge.exposeInMainWorld("msph", {
  version: process.versions.electron,
});
