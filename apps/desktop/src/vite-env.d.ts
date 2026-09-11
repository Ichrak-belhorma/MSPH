/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Socket.IO server origin. Defaults to VITE_API_BASE_URL with the
   * trailing /api stripped — see src/lib/socket.ts. */
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Exposed by electron/preload.cts via contextBridge — see
 * electron/secureStorage.cts for what's actually behind it. Undefined
 * when the app runs outside Electron (shouldn't happen in production,
 * but keeps `window.msph?.…` honest during e.g. a plain browser preview). */
interface MsphBridge {
  version: string;
  secureStorage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

interface Window {
  msph?: MsphBridge;
}
