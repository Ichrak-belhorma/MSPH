import { contextBridge, ipcRenderer } from "electron";

/**
 * The renderer's only bridge to the main process. Deliberately narrow —
 * three purpose-built calls for the encrypted refresh-token store (see
 * secureStorage.cts), nothing that hands over generic filesystem/Node
 * access. `contextIsolation: true` + `nodeIntegration: false` (see
 * main.cts) mean this is the *only* way the renderer can reach anything
 * outside the browser sandbox.
 */
contextBridge.exposeInMainWorld("msph", {
  version: process.versions.electron,
  secureStorage: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke("secure-storage:get", key),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke("secure-storage:set", key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke("secure-storage:delete", key),
  },
});
