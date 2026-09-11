/**
 * Central query-key factory. Used both by the `useQuery` calls in each
 * `src/api/*.ts` module and by `src/realtime/RealtimeProvider.tsx`, which
 * needs to invalidate the *same* keys from outside any component when a
 * Socket.IO event arrives — keeping them in one place is what makes that
 * safe (a typo'd key here would silently break realtime updates there).
 */
export const queryKeys = {
  me: () => ["me"] as const,
  cases: {
    list: (params?: unknown) => ["cases", "list", params] as const,
    detail: (id: string) => ["cases", "detail", id] as const,
    timeline: (id: string) => ["cases", "timeline", id] as const,
    all: () => ["cases"] as const,
  },
  visits: {
    list: (params?: unknown) => ["visits", "list", params] as const,
    detail: (id: string) => ["visits", "detail", id] as const,
    all: () => ["visits"] as const,
  },
  customers: {
    list: (params?: unknown) => ["customers", "list", params] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
  },
  properties: {
    list: (params?: unknown) => ["properties", "list", params] as const,
    detail: (id: string) => ["properties", "detail", id] as const,
  },
  landlords: {
    list: (params?: unknown) => ["landlords", "list", params] as const,
  },
  treatments: {
    list: (params?: unknown) => ["treatments", "list", params] as const,
    detail: (id: string) => ["treatments", "detail", id] as const,
  },
  users: {
    list: (params?: unknown) => ["users", "list", params] as const,
    detail: (id: string) => ["users", "detail", id] as const,
  },
};
