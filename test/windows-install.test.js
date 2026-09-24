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
    Zotero: { DataDirectory: { dir: 'C:\\Users\\测试 User\\Zotero' }, ZotAgent: { _rootURI: 'jar:file:///installed.xpi!/' },
      Prefs: { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) },
      File: { getContentsAsync: async () => '{"version":"0.3.8"}', download: async () => { throw new Error('jar resources must not use the HTTP download helper'); } },
    },
  };
  vm.runInNewContext(source, context);
  return { plugin: context.Zotero.ZotAgent, extracted, prefs, archives: () => archives, copies: () => copies };
}
test('installed XPI extracts runtime and Windows PTY to local data directory, reuses completed installation', async () => {
  const f = fixture();
  const result = await f.plugin.prepareWindowsRuntime();
  assert.equal(result.node, 'C:\\Node\\node.exe');
  assert.equal(result.script, 'C:\\Users\\测试 User\\Zotero\\zotagent\\runtime\\0.3.8\\src\\index.js');
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
test('unsupported resource scheme fails before saving runtime paths', async () => {
  const f = fixture(true, 'https');
  await assert.rejects(f.plugin.prepareWindowsRuntime(), /不支持的插件资源位置/);
  assert.equal(f.prefs.size, 0);
});
