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
  assert.equal(invocation.stdin, request.prompt);
  assert.ok(!invocation.args.includes(request.prompt));
});

test("OpenCode leaves model selection to its native configuration by default", () => {
  const invocation = adapters.opencode.buildInvocation(request);
  assert.equal(invocation.args.includes("--model"), false);
  const overridden = adapters.opencode.buildInvocation({ ...request, model: "provider/model" });
  assert.ok(overridden.args.includes("--model"));
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

test("native terminals start top-level interactive clients", () => {
  assert.deepEqual(adapters.opencode.interactiveArgs("session-1", request.cwd).args, [request.cwd]);
  assert.deepEqual(adapters["claude-code"].interactiveArgs("session-1", request.cwd).args, ["--resume", "session-1"]);
  assert.deepEqual(adapters["claude-code"].interactiveArgs(null, request.cwd).args, []);
  assert.deepEqual(adapters.codex.interactiveArgs("session-1", request.cwd).args, ["--cd", request.cwd, "resume", "session-1"]);
});

test("Codex adapter passes --image for request files", () => {
  const withFiles = { ...request, files: ["/tmp/capture.png", "/tmp/other.png"] };
  const invocation = adapters.codex.buildInvocation(withFiles);
  const imageIndex = invocation.args.indexOf("--image");
  assert.ok(imageIndex !== -1, "expected --image flag in args");
  assert.equal(invocation.args[imageIndex + 1], "/tmp/capture.png");
  const secondIndex = invocation.args.indexOf("--image", imageIndex + 1);
  assert.ok(secondIndex !== -1, "expected second --image flag");
  assert.equal(invocation.args[secondIndex + 1], "/tmp/other.png");
});

test("capability flags: Codex, OpenCode, and Claude support images", () => {
  assert.equal(adapters.codex.supportsImages, true);
  assert.equal(adapters.opencode.supportsImages, true);
  assert.equal(adapters["claude-code"].supportsImages, true);
});

test("no adapter claims approval support", () => {
  assert.equal(adapters.codex.supportsApproval, false);
  assert.equal(adapters.opencode.supportsApproval, false);
  assert.equal(adapters["claude-code"].supportsApproval, false);
});

test('Claude transports screenshot bytes in a structured user message for fresh and resumed sessions', () => {
  for (const nativeSessionID of [null, 'session-1']) {
    const invocation = adapters['claude-code'].buildInvocation({ ...request, nativeSessionID, image: 'data:image/png;base64,aGVsbG8=' });
    assert.equal(invocation.args[invocation.args.indexOf('--input-format')+1],'stream-json');
    const input = JSON.parse(invocation.stdin);
    assert.equal(input.type,'user'); assert.equal(input.message.content[0].text,request.prompt);
    assert.deepEqual(input.message.content[1],{type:'image',source:{type:'base64',media_type:'image/png',data:'aGVsbG8='}});
    assert.equal(invocation.keepStdinOpen,false);
  }
});
test('Claude rejects unsupported image types rather than claiming successful attachment',()=>{
  assert.throws(()=>adapters['claude-code'].buildInvocation({...request,image:'data:image/svg+xml;base64,aGVsbG8='}),/Unsupported image/);
});

test('OpenCode rejects display labels before spawning, accepts provider/model IDs and leaves empty defaults alone',()=>{
  assert.throws(()=>adapters.opencode.buildInvocation({...request,model:'MiMo-V2.6-Flash Free/OpenCode Zen'}),/provider\/model ID/);
  assert.throws(()=>adapters.opencode.buildInvocation({...request,model:'model-without-provider'}),/provider\/model ID/);
  const invocation=adapters.opencode.buildInvocation({...request,model:'opencode/mimo-v2.6-flash-free'});
  assert.equal(invocation.args[invocation.args.indexOf('--model')+1],'opencode/mimo-v2.6-flash-free');
  assert.equal(adapters.opencode.buildInvocation({...request,model:'  '}).args.includes('--model'),false);
});
