import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LoginInput, User } from "@msph/shared";
import * as authApi from "../api/auth";
import { apiClient } from "../lib/apiClient";
import { clearSession, getRefreshToken, getSession, setSession, subscribe } from "../lib/authStore";
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from "../lib/secureStorage";
import { queryClient } from "../lib/queryClient";

/** Same shape and boot-resume flow as apps/desktop/src/auth/AuthContext.tsx
 * — see CONTEXT.md "Authentication". `initializing` gates the whole app so
 * a worker who's already logged in never sees the login screen flash. */
interface AuthContextValue {
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
        // Dead/expired/revoked token, or offline at launch: fall through
        // to the login screen either way. Only clear the stored token on
        // an actual rejection, not a network failure — a worker who's
        // offline on launch shouldn't get silently logged out; they'll
        // resume normally next time the app opens with connectivity.
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
