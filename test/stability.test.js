import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fixture } from './helpers/plugin-fixture.js';
import { createModelCatalog } from '../runtime/src/opencode-models.js';
import { createAgentLauncher, nativePlatform } from '../runtime/src/agent-launch.js';

const delay = ms => new Promise(r => setTimeout(r, ms));
const posixOnly = { skip: process.platform === 'win32', timeout: 20000 };

test('unclaimed native terminal is closed and stops reserving the Agent', posixOnly, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zotagent-pty-claim-'));
  const executable = path.join(dir, 'fake-codex');
  await writeFile(executable, `#!${process.execPath}\nprocess.stdin.resume();setInterval(()=>{},1000);\n`, { mode: 0o755 });
  const child = spawn(process.execPath, ['runtime/src/index.js', '--port', '0', '--token', 'claim-test'], {
    cwd: path.resolve(import.meta.dirname, '..'), stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, ZOTAGENT_DATA_DIR: path.join(dir, 'data'), ZOTAGENT_PTY_CLAIM_MS: '400' },
  });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } await rm(dir, { recursive: true, force: true }); });
  let log = ''; child.stderr.on('data', c => log += c);
  for (let i = 0; i < 150 && !log.includes('listening on'); i++) await delay(20);
  const port = log.match(/127\.0\.0\.1:(\d+)/)?.[1]; assert.ok(port, log);
  const request = (route, body) => fetch(`http://127.0.0.1:${port}${route}`, { method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer claim-test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await request('/v1/config/agents', { executables: { codex: executable } })).status, 200);

  // Simulates a client that timed out and never read the created ptyID.
  const orphan = await (await request('/v1/pty/create', { agent: 'codex', cwd: dir })).json();
  assert.ok((await (await request('/v1/pty/list')).json()).sessions.some(s => s.id === orphan.ptyID));
  for (let i = 0; i < 100 && (await (await request('/v1/pty/list')).json()).sessions.length; i++) await delay(20);
  assert.deepEqual((await (await request('/v1/pty/list')).json()).sessions, []);
  const next = await request('/v1/pty/create', { agent: 'codex', cwd: dir });
  assert.equal(next.status, 200);

  // A subscribed terminal is owned by its window and survives the claim window.
  const owned = await next.json();
  const controller = new AbortController();
  const read = await fetch(`http://127.0.0.1:${port}/v1/pty/read?id=${owned.ptyID}`, { headers: { authorization: 'Bearer claim-test' }, signal: controller.signal });
  t.after(() => controller.abort());
  assert.equal(read.status, 200);
  await delay(700);
  assert.ok((await (await request('/v1/pty/list')).json()).sessions.some(s => s.id === owned.ptyID && s.alive));
});

test('Agent detection runs once per Runtime instance and settings, not before every message', async () => {
  const f = fixture(), manager = f.api.RuntimeManager;
  let detections = 0;
  manager.request = async route => {
    if (route === '/v1/agents') detections++;
    return { ok: true, json: async () => ({}) };
  };
  manager._health = { instanceID: 'first', platform: 'wsl' };
  const sync = force => new f.api.RuntimeClient(null).syncAgentPaths(force);
  await sync(); await sync();
  assert.equal(detections, 1);
  f.prefs.set('extensions.zotagent.codexPath', '/opt/other/codex');
  await sync();
  assert.equal(detections, 2);
  await sync(true);
  assert.equal(detections, 3);
  manager._health = { instanceID: 'restarted', platform: 'wsl' };
  await sync();
  assert.equal(detections, 4);
});

test('failed Agent detection is retried on the next message', async () => {
  const f = fixture(), manager = f.api.RuntimeManager;
  let detections = 0, fail = true;
  manager.request = async route => {
    if (route === '/v1/agents') { detections++; if (fail) throw new Error('timeout'); }
    return { ok: true, json: async () => ({}) };
  };
  manager._health = { instanceID: 'only', platform: 'wsl' };
  await assert.rejects(new f.api.RuntimeClient(null).syncAgentPaths(), /timeout/);
  fail = false;
  await new f.api.RuntimeClient(null).syncAgentPaths();
  assert.equal(detections, 2);
});

async function modelFixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'zotagent-model-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = path.join(dir, 'fake-opencode');
  await writeFile(executable, `#!${process.execPath}
const fs=require('fs'),path=require('path');const dir=${JSON.stringify(dir)};const args=process.argv.slice(2);
fs.appendFileSync(path.join(dir,'calls'),args[0]+'\\n');
if(args[0]==='models') console.log(fs.readFileSync(path.join(dir,'models'),'utf8'));
else if(args[0]==='debug') console.log('state '+dir);
`, { mode: 0o755 });
  await writeFile(path.join(dir, 'models'), 'opencode/a\nopencode/b');
  await writeFile(path.join(dir, 'model.json'), JSON.stringify({ recent: [{ providerID: 'opencode', modelID: 'a' }] }));
  const launcher = createAgentLauncher({ shell: { name: 'bash' }, defaultCwd: dir, platforms: { opencode: nativePlatform }, executables: { opencode: executable } });
  const location = await launcher.resolve('opencode');
  const storePath = path.join(dir, 'data', 'opencode-models.json');
  const calls = async name => (existsSync(path.join(dir, 'calls')) ? (await readFile(path.join(dir, 'calls'), 'utf8')).split('\n') : []).filter(x => x === name).length;
  return { dir, launcher, location, storePath, calls, catalog: () => createModelCatalog(launcher, { storePath }) };
}

test('model list persists across Runtime restarts and expired lists refresh in the background', posixOnly, async t => {
  const m = await modelFixture(t);
  assert.deepEqual((await m.catalog()(m.location)).models, ['opencode/a', 'opencode/b']);
  assert.equal(await m.calls('models'), 1);

  const restarted = m.catalog();
  const cached = await restarted(m.location);
  assert.deepEqual(cached.models, ['opencode/a', 'opencode/b']);
  assert.equal(cached.recent, 'opencode/a');
  assert.equal(await m.calls('models'), 1);
  assert.equal(await m.calls('debug'), 1);

  const store = JSON.parse(await readFile(m.storePath, 'utf8'));
  for (const entry of Object.values(store.catalogs)) entry.at = 0;
  await writeFile(m.storePath, JSON.stringify(store));
  await writeFile(path.join(m.dir, 'models'), 'opencode/a\nopencode/b\nopencode/c');
  const expired = m.catalog();
  const stale = await expired(m.location, false, { recent: false });
  assert.deepEqual(stale.models, ['opencode/a', 'opencode/b'], 'expired list must not block the request');
  for (let i = 0; i < 100 && (await expired(m.location, false, { recent: false })).models.length < 3; i++) await delay(20);
  assert.deepEqual((await expired(m.location, false, { recent: false })).models, ['opencode/a', 'opencode/b', 'opencode/c']);
});

test('a model missing from the cached list triggers one fresh query before rejecting', posixOnly, async t => {
  const m = await modelFixture(t);
  const catalog = m.catalog();
  await catalog(m.location);
  await writeFile(path.join(m.dir, 'models'), 'opencode/a\nopencode/b\nopencode/new');
  assert.ok((await catalog(m.location, false, { recent: false, model: 'opencode/new' })).models.includes('opencode/new'));
  assert.equal(await m.calls('models'), 2);

  await writeFile(path.join(m.dir, 'model.json'), JSON.stringify({ recent: [{ providerID: 'opencode', modelID: 'later' }] }));
  await writeFile(path.join(m.dir, 'models'), 'opencode/a\nopencode/later');
  const followed = await catalog(m.location);
  assert.equal(followed.recent, 'opencode/later');
  assert.ok(followed.models.includes('opencode/later'));
});

test('corrupt model store is ignored instead of breaking preparation', posixOnly, async t => {
  const m = await modelFixture(t);
  await writeFile(path.join(m.dir, 'bad.json'), '{not json');
  const catalog = createModelCatalog(m.launcher, { storePath: path.join(m.dir, 'bad.json') });
  assert.deepEqual((await catalog(m.location, false, { recent: false })).models, ['opencode/a', 'opencode/b']);
});
