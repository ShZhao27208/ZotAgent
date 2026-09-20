import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { resolveFromPath } from '../runtime/src/config.js';

const source = readFileSync(new URL('../plugin/content/zot-agent.js', import.meta.url), 'utf8');
function fixture() {
  const prefs = new Map([['runtimeToken', "token'with spaces"], ['runtimeNodePath', '/opt/node path/node']]);
  const calls = [];
  const sandbox = {
    Zotero: { Prefs: {
      get: key => prefs.get(key.replace('extensions.zotagent.', '')),
      set: (key, value) => prefs.set(key.replace('extensions.zotagent.', ''), value),
    }, debug() {} },
    Components: { interfaces: {}, classes: {
      '@mozilla.org/file/local;1': { createInstance: () => ({ initWithPath() {}, exists: () => true }) },
      '@mozilla.org/process/util;1': { createInstance: () => ({ init() {}, runwAsync: args => calls.push(args) }) },
    } },
    setTimeout, clearTimeout,
    fetch: async url => ({ ok: true, json: async () => url.endsWith('/v1/agents') ? {
      codex: { available: true, executable: '/opt/codex' },
      'claude-code': { available: true, executable: '/opt/claude' },
    } : { defaultCwd: "/home/runtime-user" } }),
  };
  vm.runInNewContext(source, sandbox);
  const plugin = sandbox.Zotero.ZotAgent;
  plugin._rootURI = 'jar:file:///C:/Users/test/extensions/zotagent.xpi!/';
  plugin._runtimeLocation = { script: "/home/user/project's folder/runtime/src/index.js" };
  return { manager: plugin.runtimeManager, prefs, calls };
}

test('installed XPI uses build runtime location and safely quotes launch arguments', () => {
  const { manager, calls, prefs } = fixture();
  manager.launch();
  assert.equal(prefs.get('runtimeScriptPath'), "/home/user/project's folder/runtime/src/index.js");
  const command = calls[0].at(-1);
  assert.equal(spawnSync('bash', ['-n', '-c', command]).status, 0);
  // Replace exec with an argument printer, preserving the actual shell parsing.
  const executed = spawnSync('bash', ['-c', command.replace('exec "$ZA_NODE"', "printf '%s\\n' \"$ZA_NODE\"")], {
    env: { HOME: '/nonexistent', PATH: '/usr/bin:/bin' }, encoding: 'utf8',
  });
  assert.equal(executed.status, 0);
  assert.equal(executed.stdout, "/opt/node path/node\n/home/user/project's folder/runtime/src/index.js\n");
});

test('connecting detects agents before any dialog exists and concurrent calls share startup', async () => {
  const { manager, prefs } = fixture();
  let launches = 0;
  manager.probe = async () => 'offline';
  manager.healthy = async () => true;
  manager.launch = () => launches++;
  await Promise.all([manager.ensureRunning(), manager.ensureRunning()]);
  assert.equal(launches, 1);
  assert.equal(prefs.get('codexPath'), '/opt/codex');
  assert.equal(prefs.get('claudePath'), '/opt/claude');
});

test('agent discovery finds native and NVM installations without shell PATH initialization', () => {
  const home = mkdtempSync(join(tmpdir(), 'zotagent-discovery-'));
  try {
    for (const relative of ['.local/bin/claude', '.nvm/versions/node/v24.1.0/bin/codex']) {
      const full = join(home, relative);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, '#!/bin/sh\n', { mode: 0o755 });
    }
    const env = { HOME: home, PATH: '' };
    assert.equal(resolveFromPath('claude', env, '/nonexistent/node'), join(home, '.local/bin/claude'));
    assert.equal(resolveFromPath('codex', env, '/nonexistent/node'), join(home, '.nvm/versions/node/v24.1.0/bin/codex'));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('healthy runtime supplies a missing working directory and preserves an explicit directory', async () => {
  const { manager, prefs } = fixture();
  assert.equal(await manager.probe(), 'running');
  assert.equal(prefs.get('defaultWorkingDirectory'), '/home/runtime-user');
  prefs.set('defaultWorkingDirectory', '/work/my-project');
  await manager.probe();
  assert.equal(prefs.get('defaultWorkingDirectory'), '/work/my-project');
});
