import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError, NetworkError } from "./apiClient";

/** Same policy as apps/desktop/src/lib/queryClient.ts: don't retry a
 * 401/403 (refreshing already happened inside apiClient, or the worker
 * genuinely isn't allowed), retry a plain network drop a couple of times
 * (a phone on a weak site connection is the whole point of this app). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) return false;
        if (error instanceof NetworkError) return failureCount < 2;
        return failureCount < 1;
      },
      staleTime: 15_000,
    },
    mutations: {
      retry: false,
    },
  },
});
