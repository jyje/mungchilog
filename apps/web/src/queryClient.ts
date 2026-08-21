import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";

// IndexedDB-backed persistence so a trip's data survives being fully
// offline on cold start (subway dead zones, airplane mode) - not just
// the Workbox NetworkFirst cache, which only helps once a request has
// already been made once in that service worker's lifetime. See M5 in
// TASK.md/PLAN.md.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 30, // 30 days, matches the server's leg cache TTL
      staleTime: 1000 * 30,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key: string) => get(key),
    setItem: (key: string, value: string) => set(key, value),
    removeItem: (key: string) => del(key),
  },
});
