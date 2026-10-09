import fs from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const packageJSON = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(root, "plugin/manifest.json"), "utf8"));
const required = [
  "plugin/bootstrap.js",
  "plugin/content/runtime-installer.js",
  "plugin/content/runtime-build.js",
  "plugin/prefs.js",
  "plugin/content/zot-agent.js",
  "plugin/content/preferences.xhtml",
  "runtime/src/index.js",
];

if (manifest.applications?.zotero?.strict_min_version !== "6.999") {
  throw new Error("Manifest compatibility floor must be 6.999 for Zotero Manifest V2");
}
for (const file of required) await fs.access(path.join(root, file));

const scripts = [
  "plugin/bootstrap.js",
  "plugin/content/runtime-installer.js",
  "plugin/content/runtime-build.js",
  "plugin/content/zot-agent.js",
  "plugin/content/preferences.js",
  "plugin/content/archive-format.js",
  "plugin/content/conversation-archive.js",
  "plugin/content/archive-export.js",
  "runtime/src/index.js",
  "runtime/src/normalize.js",
  "runtime/src/agent-launch.js",
  "runtime/src/opencode-models.js",
  "runtime/src/runtime-identity.js",
  "runtime/src/protocol.js",
  "runtime/src/config.js",
  "runtime/src/adapters/opencode.js",
  "runtime/src/adapters/claude.js",
  "runtime/src/adapters/codex.js",
  "runtime/src/pty-manager.js",
];
for (const script of scripts) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, script)], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${script}: ${result.stderr}`);
}

const xpi = path.join(root, "dist", `zotagent-${packageJSON.version}.xpi`);
const entries = unzip(await fs.readFile(xpi));
if (JSON.parse(entries.get("manifest.json").toString()).version !== packageJSON.version) throw new Error("XPI version mismatch");
for (const script of scripts.filter(name => name.startsWith("plugin/"))) {
  const source = await fs.readFile(path.join(root, script));
  if (!entries.get(script.slice(7))?.equals(source)) throw new Error(`Stale XPI source: ${script}`);
}
const runtime = unzip(entries.get("runtime.zip"));
const { runtimeBuildID } = await import("../runtime/src/runtime-identity.js");
if (!entries.get("content/runtime-build.js").toString().includes(runtimeBuildID())) throw new Error("Stale Runtime build identity");
for (const name of ["src/index.js", "src/runtime-identity.js", "src/protocol.js", "src/opencode-models.js", "src/normalize.js", "src/agent-launch.js", "src/config.js", "src/adapters/claude.js", "src/adapters/codex.js", "src/adapters/opencode.js", "src/pty-manager.js"]) {
  if (!runtime.get(name)?.equals(await fs.readFile(path.join(root, "runtime", name)))) throw new Error(`Stale Runtime source: ${name}`);
}
for (const arch of ["x64", "arm64"]) {
  if (![...runtime.keys()].some(name => name.includes(`prebuilds/win32-${arch}/`) && name.endsWith(".node"))) throw new Error(`Missing Windows ${arch} PTY binary`);
}
function unzip(buffer) {
  if (!buffer) throw new Error("Missing ZIP archive");
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8), size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26), extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength, data = buffer.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error("Unsupported ZIP method");
    files.set(name, method === 8 ? inflateRawSync(data) : data);
    offset = start + size;
  }
  return files;
}
process.stdout.write(`Verified manifest, scripts, and ${xpi}\n`);
