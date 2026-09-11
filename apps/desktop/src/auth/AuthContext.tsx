import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import type { LoginInput, User } from "@msph/shared";
import * as authApi from "../api/auth.js";
import { apiClient } from "../lib/apiClient.js";
import { clearSession, getRefreshToken, getSession, setSession, subscribe } from "../lib/authStore.js";
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from "../lib/secureStorage.js";
import { queryClient } from "../lib/queryClient.js";

interface AuthContextValue {
  /** True while the app is trying to silently resume a session from the
   * stored refresh token, at boot only. The whole app waits on this
   * before rendering anything auth-gated, so there's no login-screen
   * flash for a user who's already signed in. */
  initializing: boolean;
  user: User | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSession);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resumeSession() {
      const refreshToken = await loadRefreshToken();
      if (!refreshToken) {
        if (!cancelled) setInitializing(false);
        return;
      }
      try {
        const refreshed = await apiClient.raw<{ accessToken: string; refreshToken: string }>("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
        const me = await apiClient.raw<User>("/me", {
          headers: { Authorization: `Bearer ${refreshed.accessToken}` },
        });
        if (cancelled) return;
        setSession({ accessToken: refreshed.accessToken, user: me }, refreshed.refreshToken);
        await saveRefreshToken(refreshed.refreshToken);
      } catch {
        // Dead/expired/revoked refresh token — fall through to the login
        // screen. Clearing it here avoids retrying a known-dead token on
        // every future launch.
        await clearRefreshToken();
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    void resumeSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(input: LoginInput) {
    const result = await authApi.login(input);
    setSession({ accessToken: result.accessToken, user: result.user }, result.refreshToken);
    await saveRefreshToken(result.refreshToken);
  }

  async function logout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      // Best-effort — the user is logging out either way, a network
      // hiccup here shouldn't trap them in the app.
      await authApi.logout(refreshToken).catch(() => undefined);
    }
    clearSession();
    await clearRefreshToken();
    queryClient.clear();
  }

  const value: AuthContextValue = {
    initializing,
    user: session?.user ?? null,
    isAuthenticated: session !== null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
