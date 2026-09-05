import assert from "node:assert/strict";
import test from "node:test";
import { isViableTransitRoute } from "./google.js";

test("a transit request answered with zero TRANSIT steps is not a viable route", () => {
  // Confirmed live: Hankyu Umeda Main Store -> Kitahama Retro Building
  // returns HTTP 200 with a route made entirely of WALK steps when TRANSIT
  // is requested. That is Google silently substituting a walk, not a real
  // transit journey, and must not be accepted as one.
  const allWalking = [{ steps: [{ travelMode: "WALK" }, { travelMode: "WALK" }] }];
  assert.equal(isViableTransitRoute("TRANSIT", allWalking), false);
});

test("a transit route with at least one real TRANSIT step is viable", () => {
  const withTransit = [{ steps: [{ travelMode: "WALK" }, { travelMode: "TRANSIT" }, { travelMode: "WALK" }] }];
  assert.equal(isViableTransitRoute("TRANSIT", withTransit), true);
});

test("no legs at all is not a viable transit route", () => {
  assert.equal(isViableTransitRoute("TRANSIT", undefined), false);
  assert.equal(isViableTransitRoute("TRANSIT", []), false);
});

test("non-transit modes are never subject to this check", () => {
  // A walk or a drive is uniform by definition - there is no "fake walk"
  // failure mode to guard against for them.
  assert.equal(isViableTransitRoute("WALK", undefined), true);
  assert.equal(isViableTransitRoute("DRIVE", [{ steps: [{ travelMode: "DRIVE" }] }]), true);
});
