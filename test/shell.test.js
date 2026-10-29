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
  assert.equal(cmd.command, process.env.ComSpec || "cmd.exe");
  assert.deepEqual(cmd.args.slice(0, 2), ["/s", "/c"]);
});

test('Windows CMD executes npm-style wrappers with literal spaced paths', { skip: process.platform !== 'win32' }, async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { ptyShellArgs } = await import('../runtime/src/shell.js');
  const dir = mkdtempSync(join(tmpdir(), 'zotagent shell '));
  try {
    const wrapper = join(dir, 'agent test.cmd');
    writeFileSync(wrapper, '@echo off\r\necho version=%~1\r\necho "value=%~2"\r\n');
    const invocation = shellInvocation({ name: 'cmd' }, wrapper, ['--version', 'hello & world']);
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: dir, encoding: 'utf8', windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /version=--version/);
    assert.match(result.stdout, /value=hello & world/);
    // Validate the raw command line sent to node-pty too.
    assert.equal(ptyShellArgs(invocation), invocation.args.join(' '));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CMD arguments caret-escape metacharacters so quotes, pipes and %VAR% stay literal', async () => {
  const { shellInvocation } = await import('../runtime/src/shell.js');
  const invocation = shellInvocation({ name: 'cmd' }, 'C:\\npm\\codex.cmd', ['a"b & c', '%PATH%', 'tail\\']);
  const line = invocation.args.at(-1);
  assert.ok(!/(^|[^^])&/.test(line.replaceAll('^^', '')), 'every & is escaped');
  assert.ok(line.includes('^%PATH^%'), '%VAR% is not expanded');
  assert.ok(line.includes('^"a\\^"b^ ^&^ c^"'), 'embedded quote is backslash-escaped for the program and caret-escaped for cmd');
  assert.ok(line.includes('^"tail\\\\^"'), 'trailing backslash is doubled so it does not escape the closing quote');
});
