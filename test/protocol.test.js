import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorized } from "../runtime/src/protocol.js";

function fakeRequest(authHeader) {
  return { headers: { authorization: authHeader || "" } };
}

test("accepts a correct Bearer token", () => {
  assert.equal(isAuthorized(fakeRequest("Bearer my-secret"), "my-secret"), true);
});

test("rejects an incorrect Bearer token", () => {
  assert.equal(isAuthorized(fakeRequest("Bearer wrong"), "my-secret"), false);
});

test("rejects when Bearer prefix is missing", () => {
  assert.equal(isAuthorized(fakeRequest("my-secret"), "my-secret"), false);
});

test("rejects when no authorization header is present", () => {
  assert.equal(isAuthorized({ headers: {} }, "my-secret"), false);
});

test("both empty token and empty header matches as true", () => {
  // Edge case: timingSafeEqual on two zero-length buffers returns true
  assert.equal(isAuthorized(fakeRequest("Bearer "), ""), true);
  assert.equal(isAuthorized(fakeRequest(""), ""), true);
});

test("rejects tokens with different lengths", () => {
  assert.equal(isAuthorized(fakeRequest("Bearer short"), "a-much-longer-token"), false);
});
