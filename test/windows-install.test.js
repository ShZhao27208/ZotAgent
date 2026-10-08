import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { win32 } from 'node:path';
const source = readFileSync(new URL('../plugin/content/runtime-installer.js', import.meta.url), 'utf8');
function fixture(hasNode = true, scheme = 'jar') {
  const entries = new Set(hasNode ? ['C:\\Node\\node.exe'] : []);
  const prefs = new Map();
  const extracted = [];
  class File {
    initWithPath(p) { this.path = p; }
    clone() { const f = new File(); f.path = this.path; return f; }
    append(p) { this.path = win32.join(this.path, p); }
    exists() { return entries.has(this.path); }
    isFile() { return true; }
    create() { entries.add(this.path); }
    remove() { entries.delete(this.path); }
    get leafName() { return win32.basename(this.path); }
    copyTo(base, name) { copies++; entries.add(win32.join(base.path, name)); }
  }
  let copies = 0;
  let archives = 0;
  const context = {
    Services: { env: { get: name => name === 'PATH' ? 'C:\\Node' : '' }, io: { newURI: value => {
      assert.ok(value.endsWith('/runtime.zip'));
      const source = new File(); source.initWithPath('C:\\安装 目录\\installed.xpi');
      return { scheme, get username() { throw new Error('nsIURI.username'); },
        QueryInterface: () => scheme === 'jar'
          ? { JARFile: { QueryInterface: () => ({ file: source }) }, JAREntry: 'runtime.zip' }
          : { file: source } };
    } } },
    Components: { interfaces: { nsIFile: {} }, classes: {
      '@mozilla.org/file/local;1': { createInstance: () => new File() },
      '@mozilla.org/libjar/zip-reader;1': { createInstance: () => ({
        open() {}, close() {}, findEntries() { const files = ['src/', 'src/index.js', 'node_modules/node-pty/prebuilds/win32-x64/conpty.node'];
          return { hasMore: () => files.length, getNext: () => files.shift() }; },
        extract(name, dest) { if (name === 'runtime.zip') archives++; entries.add(dest.path); extracted.push(name); },
      }) },
    } },
    Zotero: { DataDirectory: { dir: 'C:\\Users\\测试 User\\Zotero' }, ZotAgent: { _rootURI: 'jar:file:///installed.xpi!/', _version: '0.3.9' },
      Prefs: { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) },
      File: { getContentsAsync: async uri => {
        // Zotero forwards jar: strings to HTTP.request(), which reads URI credentials.
        if (uri.startsWith('jar:')) throw new Error('NS_ERROR_FAILURE [nsIURI.username]');
        throw new Error('Installer must not fetch its manifest through Zotero.File');
      }, download: async () => { throw new Error('jar resources must not use the HTTP download helper'); } },
    },
  };
  vm.runInNewContext(source, context);
  return { plugin: context.Zotero.ZotAgent, extracted, prefs, archives: () => archives, copies: () => copies };
}
test('installed XPI extracts runtime and Windows PTY to local data directory, reuses completed installation', async () => {
  const f = fixture();
  const result = await f.plugin.prepareWindowsRuntime();
  assert.equal(result.node, 'C:\\Node\\node.exe');
  assert.equal(result.script, 'C:\\Users\\测试 User\\Zotero\\zotagent\\runtime\\0.3.9\\src\\index.js');
  assert.ok(f.extracted.includes('node_modules/node-pty/prebuilds/win32-x64/conpty.node'));
  await f.plugin.prepareWindowsRuntime();
  assert.equal(f.archives(), 1);
  assert.equal(f.prefs.get('extensions.zotagent.runtimeScriptPath'), result.script);
});
test('missing Node reports a Windows Node remedy without requesting WSL installation', async () => {
  await assert.rejects(fixture(false).plugin.prepareWindowsRuntime(), /未检测到 Windows Node.js/);
});

test('unpacked plugin copies the local runtime archive without a download', async () => {
  const f = fixture(true, 'file');
  await f.plugin.prepareWindowsRuntime();
  assert.equal(f.copies(), 1);
  assert.equal(f.archives(), 0);
});
test('extraction failure preserves discovered Node and identifies failing stage', async () => {
  const f = fixture(true, 'https');
  await assert.rejects(f.plugin.prepareWindowsRuntime(), /从本地插件提取 Runtime 包失败：不支持的插件资源位置/);
  assert.equal(f.prefs.get('extensions.zotagent.runtimeNodePath'), 'C:\\Node\\node.exe');
  assert.equal(f.prefs.has('extensions.zotagent.runtimeScriptPath'), false);
});

test('invalid bootstrap version cannot become an extraction directory', async () => {
  const f = fixture();
  f.plugin._version = '../invalid';
  await assert.rejects(f.plugin.prepareWindowsRuntime(), /读取插件版本失败/);
  assert.equal(f.archives(), 0);
});

test('bootstrap passes host version to installer before startup hooks run', async () => {
  let startupVersion;
  const sandbox = {
    Zotero: {},
    Services: {
      io: { newURI: value => value },
      scriptloader: { loadSubScript(uri) {
        if (uri.endsWith('/zot-agent.js')) sandbox.Zotero.ZotAgent = {
          hooks: { onStartup: async () => { startupVersion = sandbox.Zotero.ZotAgent._version; } },
        };
      } },
    },
    ChromeUtils: { importESModule: () => ({ setTimeout, clearTimeout }) },
    Components: { interfaces: {}, classes: {
      '@mozilla.org/addons/addon-manager-startup;1': { getService: () => ({ registerChrome() {} }) },
    } },
  };
  vm.runInNewContext(readFileSync(new URL('../plugin/bootstrap.js', import.meta.url), 'utf8'), sandbox);
  await sandbox.startup({ rootURI: 'jar:file:///installed.xpi!/', version: '0.3.9' });
  assert.equal(startupVersion, '0.3.9');
});

test('invalid manual Node path is preserved instead of falling back to PATH',async()=>{
  const f=fixture();f.prefs.set('extensions.zotagent.runtimeNodePath','C:\\missing\\node.exe');
  await assert.rejects(f.plugin.prepareWindowsRuntime(),/手动配置的 Node.js 路径无效/);
  assert.equal(f.prefs.get('extensions.zotagent.runtimeNodePath'),'C:\\missing\\node.exe');
});
test('invalid manual Runtime script is preserved instead of deploying over it',async()=>{
  const f=fixture();f.prefs.set('extensions.zotagent.runtimeScriptPath','C:\\custom\\index.js');
  await assert.rejects(f.plugin.prepareWindowsRuntime(),/手动 Runtime 脚本路径无效/);
  assert.equal(f.prefs.get('extensions.zotagent.runtimeScriptPath'),'C:\\custom\\index.js');assert.equal(f.archives(),0);
});
