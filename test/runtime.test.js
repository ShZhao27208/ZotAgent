import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Runtime Host requires authentication and reports health", async (context) => {
  const port = 24000 + Math.floor(Math.random() * 1000);
  const token = "test-token";
  const child = spawn(process.execPath, ["runtime/src/index.js", "--port", String(port), "--token", token], {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
  });
  context.after(() => child.kill("SIGTERM"));

  await waitForReady(child);
  const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/health`);
  assert.equal(unauthorized.status, 401);

  const response = await fetch(`http://127.0.0.1:${port}/v1/health`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");

  const invalidConfig = await fetch(`http://127.0.0.1:${port}/v1/config/agents`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      executables: { opencode: "relative", codex: "/bin/echo", "claude-code": "/bin/echo" },
    }),
  });
  assert.equal(invalidConfig.status, 400);

  const validConfig = await fetch(`http://127.0.0.1:${port}/v1/config/agents`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      executables: { opencode: "/bin/echo", codex: "/bin/echo", "claude-code": "/bin/echo" },
    }),
  });
  assert.equal(validConfig.status, 200);
});

async function waitForReady(child) {
  let output = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => (output += chunk));
  for (let attempt = 0; attempt < 80; attempt++) {
    if (output.includes("listening on")) return;
    if (child.exitCode !== null) throw new Error(`Runtime exited: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  child.kill("SIGTERM");
  await once(child, "close");
  throw new Error(`Runtime did not start: ${output}`);
}
