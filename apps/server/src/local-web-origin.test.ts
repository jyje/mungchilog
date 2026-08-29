import assert from "node:assert/strict";
import test from "node:test";
import { localWebOrigin, localWebRedirect } from "./local-web-origin.js";

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
