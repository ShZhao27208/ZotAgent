import test from "node:test";
import assert from "node:assert/strict";
import { detectShell, shellDescriptor, shellInvocation } from "../runtime/src/shell.js";

test("detects the user's current shell", () => {
  assert.equal(detectShell({ SHELL: "/bin/zsh" }, "linux"), "zsh");
  assert.equal(detectShell({ ComSpec: "C:\\Windows\\System32\\cmd.exe" }, "win32"), "cmd");
  assert.equal(detectShell({ ComSpec: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" }, "win32"), "powershell");
});

test("uses login interactive POSIX shell invocation", () => {
  const invocation = shellInvocation(shellDescriptor({ SHELL: "/bin/bash" }, "linux"), "claude", ["--version"]);
  assert.equal(invocation.command, "bash");
  assert.deepEqual(invocation.args.slice(0, 3), ["-l", "-i", "-c"]);
  assert.match(invocation.args[3], /'claude' '--version'/);
});

test("uses native Windows shell invocation", () => {
  const powershell = shellInvocation(shellDescriptor({ ComSpec: "powershell.exe" }, "win32"), "claude", ["--version"]);
  assert.equal(powershell.command, "powershell.exe");
  assert.deepEqual(powershell.args.slice(0, 2), ["-NoLogo", "-Command"]);
  const cmd = shellInvocation(shellDescriptor({ ComSpec: "cmd.exe" }, "win32"), "claude", ["--version"]);
  assert.equal(cmd.command, "cmd.exe");
  assert.deepEqual(cmd.args.slice(0, 2), ["/d", "/s"]);
});
