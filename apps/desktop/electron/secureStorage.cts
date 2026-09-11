import { app, ipcMain, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Encrypted-at-rest key/value store for the one thing the renderer needs
 * to survive an app restart: the refresh token (the short-lived access
 * token just stays in memory — see src/auth/AuthContext.tsx). Values are
 * encrypted with the OS keychain (Electron's `safeStorage`, backed by
 * Keychain/DPAPI/libsecret) before ever touching disk, so a copy of the
 * app's data directory alone doesn't hand over a working session.
 *
 * This is the concrete "use preload/contextBridge appropriately" piece:
 * the renderer never gets filesystem or Node API access directly — it
 * only gets three narrow, purpose-built IPC calls (see preload.cts).
 *
 * Falls back to storing the raw value (prefixed so it's recognizable,
 * never silently treated as encrypted) if the OS keychain isn't
 * available — some Linux setups have no secret-service daemon running,
 * which would otherwise make the app unusable there. This is logged, not
 * silent.
 */

function storePath(): string {
  return path.join(app.getPath("userData"), "secure-storage.json");
}

async function readStore(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeStore(store: Record<string, string>): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(store), "utf8");
}

const PLAINTEXT_PREFIX = "plain:";

export function registerSecureStorageIpc(): void {
  ipcMain.handle("secure-storage:set", async (_event, key: string, value: string) => {
    const store = await readStore();
    if (safeStorage.isEncryptionAvailable()) {
      store[key] = safeStorage.encryptString(value).toString("base64");
    } else {
      console.warn("[secureStorage] OS keychain unavailable — storing value unencrypted");
      store[key] = `${PLAINTEXT_PREFIX}${value}`;
    }
    await writeStore(store);
  });

  ipcMain.handle("secure-storage:get", async (_event, key: string): Promise<string | null> => {
    const store = await readStore();
    const raw = store[key];
    if (!raw) return null;
    if (raw.startsWith(PLAINTEXT_PREFIX)) return raw.slice(PLAINTEXT_PREFIX.length);
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      return null;
    }
  });

  ipcMain.handle("secure-storage:delete", async (_event, key: string) => {
    const store = await readStore();
    delete store[key];
    await writeStore(store);
  });
}
