import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repo = "ShZhao27208/ZotAgent";
const tag = process.argv[2] || `v${JSON.parse(readFileSync(path.join(root, "package.json"))).version}`;
if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("Expected stable version tag vX.Y.Z");
const gh = args => execFileSync("gh", args, { encoding: "utf8", cwd: root });
const release = JSON.parse(gh(["api", `repos/${repo}/releases/tags/${tag}`]));
if (release.draft || release.prerelease) throw new Error("Only published stable releases can update the feed");
const version = tag.slice(1);
const filename = `zotagent-${version}.xpi`;
const asset = release.assets.find(a => a.name === filename && a.state === "uploaded");
if (!asset) throw new Error("Release XPI is not uploaded yet");
// Read compatibility from the release tag, not from a potentially newer main.
const tagged = JSON.parse(gh(["api", `repos/${repo}/contents/plugin/manifest.json?ref=${tag}`]));
const manifest = JSON.parse(Buffer.from(tagged.content, "base64").toString());
  const app = manifest?.applications?.zotero;
  if (manifest?.version !== version || app?.id !== "zotagent@shzhao.local") throw new Error("XPI identity/version mismatch");
  if (app.update_url !== `https://raw.githubusercontent.com/${repo}/main/update.json`) throw new Error("Unexpected update URL");
  const output = path.join(root, "update.json");
  const old = existsSync(output) ? JSON.parse(readFileSync(output)) : { addons: {} };
  const compare = (a, b) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  if ((old.addons[app.id]?.updates || []).some(u => compare(u.version, version) > 0)) throw new Error("Refusing to downgrade update feed");
  const result = { addons: { [app.id]: { updates: [{
    version, update_link: asset.browser_download_url,
    applications: { zotero: { strict_min_version: app.strict_min_version, strict_max_version: app.strict_max_version } },
  }] } } };
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(`Updated update.json for published GitHub release ${tag}`);

