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
    }, debug() {}, HTTP: { request: async (_method, url, options) => {
      assert.ok(options.timeout > 0);
      return { status: 200, response: url.endsWith('/v1/agents') ? {
        codex: { available: true, executable: '/opt/codex' },
        'claude-code': { available: true, executable: '/opt/claude' },
      } : { defaultCwd: '/home/runtime-user', cwdExists: false } };
    } } },
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
  return { manager: plugin.runtimeManager, prefs, calls, sandbox };
}

test('installed XPI uses build runtime location and safely quotes launch arguments', () => {
  const { manager, calls, prefs } = fixture();
  manager.launch();
  assert.equal(prefs.get('runtimeScriptPath'), "/home/user/project's folder/runtime/src/index.js");
  assert.equal(calls[0][2], "--exec");
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

test('saved Linux paths with backslashes and missing root slash are normalized before launch', () => {
  const { manager, prefs, calls } = fixture();
  prefs.set('runtimeScriptPath', String.raw`home\user\ZotAgent\runtime\src\index.js`);
  prefs.set('runtimeNodePath', String.raw`home\user\.nvm\versions\node\v24\bin\node`);
  manager.launch();
  assert.equal(prefs.get('runtimeScriptPath'), '/home/user/ZotAgent/runtime/src/index.js');
  assert.equal(prefs.get('runtimeNodePath'), '/home/user/.nvm/versions/node/v24/bin/node');
  assert.match(calls[0].at(-1), /'\/home\/user\/ZotAgent\/runtime\/src\/index.js'/);
});

test('an unresponsive health check has a short timeout and proceeds to launch', async () => {
  const { manager, sandbox } = fixture();
  let launches = 0;
  sandbox.Zotero.HTTP.request = async (_method, _url, options) => {
    assert.equal(options.timeout, 1500);
    throw new Error('timeout');
  };
  manager.launch = () => launches++;
  manager.healthy = async () => true;
  assert.equal((await manager._ensureRunning()).status, 'started');
  assert.equal(launches, 1);
});

test('failed CLI detection rejects and releases pending connection for retry', async () => {
  const { manager, sandbox } = fixture();
  sandbox.Zotero.HTTP.request = async (_method, url) => {
    if (url.endsWith('/v1/agents')) throw new Error('timeout');
    return { status: 200, response: { defaultCwd: '/home/runtime-user' } };
  };
  await assert.rejects(manager.ensureRunning(), /Agent 自动检测失败: timeout/);
  assert.equal(manager._pending, null);
});

test('incorrect home directory casing is repaired only when runtime confirms it does not exist', async () => {
  const { manager, prefs, sandbox } = fixture();
  prefs.set('defaultWorkingDirectory', '/home/Runtime-User');
  await manager.probe();
  assert.equal(prefs.get('defaultWorkingDirectory'), '/home/runtime-user');
  prefs.set('defaultWorkingDirectory', '/home/Runtime-User');
  sandbox.Zotero.HTTP.request = async () => ({ status: 200, response: { defaultCwd: '/home/runtime-user', cwdExists: true } });
  await manager.probe();
  assert.equal(prefs.get('defaultWorkingDirectory'), '/home/Runtime-User');
});
