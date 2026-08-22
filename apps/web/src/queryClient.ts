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

// The offline cache deliberately keeps itineraries for a month while the
// same person is travelling. Once that person explicitly logs out, however,
// it must not become the next user's data on a shared browser. Keep this in
// one place so both normal logout and the pending-account logout do the same
// complete cleanup.
export async function clearPrivateCache() {
  queryClient.clear();
  await persister.removeClient();
  await globalThis.caches?.delete("trips-api");
}
