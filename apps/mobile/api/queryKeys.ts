/** Central query-key factory — same purpose as apps/desktop/src/api/
 * queryKeys.ts: used both by useQuery calls and by realtime/RealtimeProvider
 * so a socket event invalidates the exact keys a mutation would. */
export const queryKeys = {
  me: () => ["me"] as const,
  visits: {
    list: (params?: unknown) => ["visits", "list", params] as const,
    detail: (id: string) => ["visits", "detail", id] as const,
    all: () => ["visits"] as const,
  },
  cases: {
    detail: (id: string) => ["cases", "detail", id] as const,
    all: () => ["cases"] as const,
  },
};
