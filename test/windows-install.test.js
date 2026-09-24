import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { win32 } from 'node:path';
const source = readFileSync(new URL('../plugin/content/runtime-installer.js', import.meta.url), 'utf8');
function fixture(hasNode = true) {
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
  }
  let downloads = 0;
  const context = {
    Services: { env: { get: name => name === 'PATH' ? 'C:\\Node' : '' } },
    Components: { interfaces: { nsIFile: {} }, classes: {
      '@mozilla.org/file/local;1': { createInstance: () => new File() },
      '@mozilla.org/libjar/zip-reader;1': { createInstance: () => ({
        open() {}, close() {}, findEntries() { const files = ['src/', 'src/index.js', 'node_modules/node-pty/prebuilds/win32-x64/conpty.node'];
          return { hasMore: () => files.length, getNext: () => files.shift() }; },
        extract(name, dest) { entries.add(dest.path); extracted.push(name); },
      }) },
    } },
    Zotero: { DataDirectory: { dir: 'C:\\Users\\测试 User\\Zotero' }, ZotAgent: { _rootURI: 'jar:file:///installed.xpi!/' },
      Prefs: { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) },
      File: { getContentsAsync: async () => '{"version":"0.3.7"}', download: async () => { downloads++; } },
    },
  };
  vm.runInNewContext(source, context);
  return { plugin: context.Zotero.ZotAgent, extracted, prefs, downloads: () => downloads };
}
test('installed XPI extracts runtime and Windows PTY to local data directory, reuses completed installation', async () => {
  const f = fixture();
  const result = await f.plugin.prepareWindowsRuntime();
  assert.equal(result.node, 'C:\\Node\\node.exe');
  assert.equal(result.script, 'C:\\Users\\测试 User\\Zotero\\zotagent\\runtime\\0.3.7\\src\\index.js');
  assert.ok(f.extracted.includes('node_modules/node-pty/prebuilds/win32-x64/conpty.node'));
  await f.plugin.prepareWindowsRuntime();
  assert.equal(f.downloads(), 1);
  assert.equal(f.prefs.get('extensions.zotagent.runtimeScriptPath'), result.script);
});
test('missing Node reports a Windows Node remedy without requesting WSL installation', async () => {
  await assert.rejects(fixture(false).plugin.prepareWindowsRuntime(), /未检测到 Windows Node.js/);
});
