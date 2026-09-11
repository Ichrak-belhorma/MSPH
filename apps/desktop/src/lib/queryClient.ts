import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./apiClient.js";

function isAuthError(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auth/permission errors won't fix themselves on retry; anything
      // else gets one retry (flaky network) before surfacing.
      retry: (failureCount, error) => !isAuthError(error) && failureCount < 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
