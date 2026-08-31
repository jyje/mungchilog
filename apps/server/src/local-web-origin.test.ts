import assert from "node:assert/strict";
import test from "node:test";
import { allowedSameOrigins, localWebOrigin, localWebPageRedirect, localWebRedirect } from "./local-web-origin.js";

test("returns the configured loopback Vite origin only in development", () => {
  const env = { NODE_ENV: "development", LOCAL_WEB_ORIGIN: "http://localhost:5173" };
  assert.equal(localWebOrigin(env), "http://localhost:5173");
  assert.equal(localWebRedirect("/trips", env), "http://localhost:5173/trips");
});

test("keeps callback redirects relative outside local development", () => {
  assert.equal(
    localWebRedirect("/pending", { NODE_ENV: "production", LOCAL_WEB_ORIGIN: "http://localhost:5173" }),
    "/pending",
  );
});

test("rejects non-loopback local web origins", () => {
  const env = { NODE_ENV: "development", LOCAL_WEB_ORIGIN: "https://mungchilog.dev.jyje.online" };
  assert.equal(localWebOrigin(env), null);
  assert.equal(localWebRedirect("/trips", env), "/trips");
});

test("allows the local Vite origin for mutations only with a valid callback origin", () => {
  assert.deepEqual(
    allowedSameOrigins({
      NODE_ENV: "development",
      LOCAL_WEB_ORIGIN: "http://localhost:5173",
      OIDC_REDIRECT_URI: "http://localhost:3000/auth/callback",
    }),
    ["http://localhost:3000", "http://localhost:5173"],
  );
  assert.deepEqual(
    allowedSameOrigins({
      NODE_ENV: "production",
      LOCAL_WEB_ORIGIN: "http://localhost:5173",
      OIDC_REDIRECT_URI: "https://mungchilog.app.jyje.online/auth/callback",
    }),
    ["https://mungchilog.app.jyje.online"],
  );
  assert.deepEqual(
    allowedSameOrigins({
      NODE_ENV: "development",
      LOCAL_WEB_ORIGIN: "http://localhost:5173",
      OIDC_REDIRECT_URI: "not-a-url",
    }),
    [],
  );
});

test("redirects direct client page navigations from the API port to Vite", () => {
  const env = { NODE_ENV: "development", LOCAL_WEB_ORIGIN: "http://localhost:5173" };
  assert.equal(
    localWebPageRedirect("/trips/4411ac41-e34a-407d-9aaf-8b768f75cee3", "?day=1", env),
    "http://localhost:5173/trips/4411ac41-e34a-407d-9aaf-8b768f75cee3?day=1",
  );
  assert.equal(localWebPageRedirect("/login", "", env), "http://localhost:5173/login");
});

test("does not redirect API, OIDC, health, or asset paths", () => {
  const env = { NODE_ENV: "development", LOCAL_WEB_ORIGIN: "http://localhost:5173" };
  for (const path of ["/api/trips", "/auth/me", "/healthz", "/readyz", "/assets/index.js"]) {
    assert.equal(localWebPageRedirect(path, "", env), null, path);
  }
});
