import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const packageJSON = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(root, "plugin/manifest.json"), "utf8"));
const required = [
  "plugin/bootstrap.js",
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
  "plugin/content/zot-agent.js",
  "plugin/content/preferences.js",
  "runtime/src/index.js",
  "runtime/src/normalize.js",
];
for (const script of scripts) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, script)], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${script}: ${result.stderr}`);
}

const xpi = path.join(root, "dist", `zotagent-${packageJSON.version}.xpi`);
await fs.access(xpi);
process.stdout.write(`Verified manifest, scripts, and ${xpi}\n`);
