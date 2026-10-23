import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(root, "build");
const distDir = path.join(root, "dist");
const pluginSource = path.join(root, "plugin");
const { runtimeBuildID } = await import("../runtime/src/runtime-identity.js");
await fs.writeFile(path.join(pluginSource, "content/runtime-build.js"), `Zotero.ZotAgent._runtimeBuildID = ${JSON.stringify(runtimeBuildID())};\n`);
const pluginBuild = path.join(buildDir, "plugin");

if (process.argv.includes("--clean")) {
  await Promise.all([
    fs.rm(buildDir, { recursive: true, force: true }),
    fs.rm(distDir, { recursive: true, force: true }),
  ]);
  process.exit(0);
}

await fs.rm(buildDir, { recursive: true, force: true });
await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(pluginBuild, { recursive: true });
await fs.mkdir(distDir, { recursive: true });
await fs.cp(pluginSource, pluginBuild, { recursive: true });
// Ship runtime sources and Windows native dependencies, never build-machine paths.
const runtimeBuild = path.join(buildDir, "runtime");
await fs.mkdir(runtimeBuild, { recursive: true });
await fs.cp(path.join(root, "runtime/src"), path.join(runtimeBuild, "src"), { recursive: true });
const { version } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
await fs.writeFile(path.join(runtimeBuild, "package.json"), JSON.stringify({ type: "module", version }));
const ptySource = path.join(root, "node_modules/node-pty");
const ptyTarget = path.join(runtimeBuild, "node_modules/node-pty");
for (const entry of ["package.json", "LICENSE", "lib", "prebuilds/win32-x64", "prebuilds/win32-arm64"]) {
  await fs.mkdir(path.dirname(path.join(ptyTarget, entry)), { recursive: true });
  await fs.cp(path.join(ptySource, entry), path.join(ptyTarget, entry), { recursive: true });
}
await fs.writeFile(path.join(pluginBuild, "runtime.zip"), createZip(await collectFiles(runtimeBuild)));
const vendorDir = path.join(pluginBuild, "content/vendor");
await fs.mkdir(vendorDir, { recursive: true });
await fs.copyFile(path.join(root, "node_modules/@xterm/xterm/lib/xterm.js"), path.join(vendorDir, "xterm.js"));
await fs.copyFile(path.join(root, "node_modules/@xterm/xterm/css/xterm.css"), path.join(vendorDir, "xterm.css"));

const packageJSON = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const manifestPath = path.join(pluginBuild, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
manifest.version = packageJSON.version;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const files = await collectFiles(pluginBuild);
const output = path.join(distDir, `zotagent-${packageJSON.version}.xpi`);
await fs.writeFile(output, createZip(files));
process.stdout.write(`Built ${output}\n`);

async function collectFiles(directory, base = directory) {
  const output = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const children = await collectFiles(absolute, base);
      if (children.length > 0) {
        output.push({
          name: path.relative(base, absolute).split(path.sep).join("/") + "/",
          data: Buffer.alloc(0),
          date: (await fs.stat(absolute)).mtime,
          isDirectory: true,
        });
        output.push(...children);
      }
    } else {
      output.push({
        name: path.relative(base, absolute).split(path.sep).join("/"),
        data: await fs.readFile(absolute),
        date: (await fs.stat(absolute)).mtime,
        isDirectory: false,
      });
    }
  }
  return output;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const isDir = Boolean(file.isDirectory);
    const payload = isDir ? Buffer.alloc(0) : file.data;
    const checksum = isDir ? 0 : crc32(payload);
    const compressed = isDir ? Buffer.alloc(0) : deflateRawSync(payload, { level: 6 });
    const method = isDir ? 0 : 8;
    const { time, date } = dosDateTime(file.date);
    const externalAttr = isDir ? (0o40755 << 16) >>> 0 : (0o100644 << 16) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(payload.length, 22);
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(payload.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(externalAttr, 38);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, compressed);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function dosDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
