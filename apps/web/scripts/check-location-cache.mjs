import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Verify the emitted worker, including serialized matchers and registration
// order. Inspecting vite.config alone misses build/serialization regressions.
const routes = [];
class NetworkOnly {}
class NetworkFirst {}
class ExpirationPlugin {}
class NavigationRoute {
  constructor(_handler, options) { this.options = options; }
}
const workbox = {
  NetworkOnly, NetworkFirst, ExpirationPlugin, NavigationRoute,
  clientsClaim() {}, precacheAndRoute() {}, cleanupOutdatedCaches() {},
  createHandlerBoundToURL() { return () => {}; },
  registerRoute(...route) { routes.push(route); },
};
const define = (_dependencies, callback) => callback(workbox);
runInNewContext(readFileSync(new URL("../dist/sw.js", import.meta.url), "utf8"), {
  self: { define, skipWaiting() {} }, define,
});

for (const path of [
  "/api/trips/example/location-sharing",
  "/api/trips/example/location-sharing/positions",
  "/api/trips/example/location-sharing?since=1",
]) {
  const url = new URL(path, "https://example.test");
  const firstMatching = routes.find(([matcher, , method]) => method === "GET" && (
    typeof matcher === "function" ? matcher({ url }) : matcher.test?.(url.href)
  ));
  assert.ok(firstMatching?.[1] instanceof NetworkOnly, `${path} must bypass persistent caches`);
  const navigation = routes.find(([matcher]) => matcher instanceof NavigationRoute)?.[0];
  assert.ok(navigation?.options.denylist.some((pattern) => pattern.test(url.pathname)),
    "API navigation must not receive an offline SPA fallback");
}
const privateRoute = routes.find(([, handler]) => handler instanceof NetworkOnly)?.[0];
assert.equal(privateRoute({ url: new URL("https://example.test/api/trips/example") }), false,
  "Ordinary offline itinerary handling must remain separate");
assert.equal(readFileSync(new URL("../dist/sw.js", import.meta.url), "utf8").includes("build-info.js"), false,
  "Deployment-specific build info must not enter the service-worker precache");
console.log("Generated service worker excludes location sharing from persistent caching.");
