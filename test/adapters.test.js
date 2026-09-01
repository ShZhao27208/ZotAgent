import test from "node:test";
import assert from "node:assert/strict";
import { createAdapters } from "../runtime/src/adapters/index.js";

const adapters = createAdapters({
  opencode: "/bin/opencode",
  codex: "/bin/codex",
  "claude-code": "/bin/claude",
});

const request = {
  prompt: "explain this paper",
  cwd: "/home/test/research",
  model: null,
  nativeSessionID: null,
  files: [],
};

test("OpenCode uses JSON events and explicit directory", () => {
  const invocation = adapters.opencode.buildInvocation(request);
  assert.equal(invocation.command, "/bin/opencode");
  assert.deepEqual(invocation.args.slice(0, 5), ["run", "--format", "json", "--dir", request.cwd]);
  assert.equal(invocation.args.at(-1), request.prompt);
});

test("Codex reads prompt from stdin and resumes native session", () => {
  const fresh = adapters.codex.buildInvocation(request);
  assert.equal(fresh.stdin, request.prompt);
  assert.ok(fresh.args.includes("--json"));
  assert.ok(fresh.args.includes("--cd"));

  const resumed = adapters.codex.buildInvocation({ ...request, nativeSessionID: "thread-1" });
  assert.deepEqual(resumed.args.slice(0, 4), ["exec", "resume", "--json", "--skip-git-repo-check"]);
  assert.ok(resumed.args.includes("thread-1"));
});

test("Claude creates and resumes explicit native sessions", () => {
  const fresh = adapters["claude-code"].buildInvocation(request);
  assert.match(fresh.nativeSessionID, /^[0-9a-f-]{36}$/);
  assert.ok(fresh.args.includes("--session-id"));
  assert.ok(!fresh.args.includes("--cwd"));
  assert.equal(fresh.cwd, request.cwd);
  assert.equal(fresh.stdin, request.prompt);

  const resumed = adapters["claude-code"].buildInvocation({ ...request, nativeSessionID: "session-1" });
  assert.ok(resumed.args.includes("--resume"));
  assert.ok(resumed.args.includes("session-1"));
});
