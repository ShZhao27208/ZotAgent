import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate sessions.js by pointing HOME to a temp directory before import
const originalHome = process.env.HOME;
const tempHome = mkdtempSync(join(tmpdir(), "zotagent-sessions-test-"));
process.env.HOME = tempHome;

const { listSessions, upsertSession, deleteSession } = await import("../runtime/src/sessions.js");

test("upsert creates a new session and list returns it", () => {
  const record = {
    agent: "opencode",
    nativeSessionID: "session-1",
    windowID: "win-1",
    cwd: "/home/test",
    createdAt: new Date().toISOString(),
  };
  const result = upsertSession(record);
  assert.equal(result.agent, "opencode");
  assert.equal(result.nativeSessionID, "session-1");
  assert.ok(result.updatedAt);

  const all = listSessions(null);
  assert.ok(all.some((s) => s.nativeSessionID === "session-1"));
});

test("upsert updates an existing session", () => {
  const updated = upsertSession({
    agent: "opencode",
    nativeSessionID: "session-1",
    windowID: "win-2",
    cwd: "/home/test2",
  });
  assert.equal(updated.windowID, "win-2");
  assert.equal(updated.cwd, "/home/test2");
  // createdAt should be preserved from the first upsert
  assert.ok(updated.createdAt);
});

test("list filters by agent", () => {
  upsertSession({
    agent: "codex",
    nativeSessionID: "session-2",
    windowID: "win-3",
    cwd: "/tmp",
  });
  const codexSessions = listSessions("codex");
  assert.ok(codexSessions.every((s) => s.agent === "codex"));
  assert.equal(codexSessions.length, 1);
});

test("delete removes a session and returns true", () => {
  const deleted = deleteSession("codex", "session-2");
  assert.equal(deleted, true);
  const remaining = listSessions("codex");
  assert.equal(remaining.length, 0);
});

test("delete returns false for non-existent session", () => {
  assert.equal(deleteSession("codex", "non-existent"), false);
});

// Cleanup
test.after(() => {
  process.env.HOME = originalHome;
  try { rmSync(tempHome, { recursive: true, force: true }); } catch {}
});
