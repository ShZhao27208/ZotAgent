import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, accessSync, constants } from "node:fs";
import { join, delimiter, dirname } from "node:path";
import { shellDescriptor } from "./shell.js";

export function resolveClaudePath() {
  const native = resolveFromPath("claude");
  if (native !== "claude") return native;
  // Scan NVM global modules for legacy Claude Code installations
  const nvmDir = process.env.NVM_DIR || join(process.env.HOME || "/tmp", ".nvm");
  try {
    const versionsDir = join(nvmDir, "versions/node");
    const nodeVersions = readdirSync(versionsDir).sort().reverse();
    for (const ver of nodeVersions) {
      const base = join(versionsDir, ver, "lib/node_modules/@anthropic-ai");
      // Check the stable package name first (current layout)
      const stable = join(base, "claude-code/bin/claude.exe");
      if (existsSync(stable)) return stable;
      // Fall back to legacy hashed directory names
      try {
        const legacy = readdirSync(base)
          .filter((name) => name.startsWith(".claude-code-") && existsSync(join(base, name, "bin/claude.exe")))
          .sort().reverse();
        if (legacy.length) return join(base, legacy[0], "bin/claude.exe");
      } catch {}
    }
  } catch {}
  // Last resort: find claude on PATH
  for (const command of ["claude", "claude-code"]) {
    try {
      const resolved = execFileSync("which", [command], { encoding: "utf8" }).trim();
      if (resolved) return resolved;
    } catch {}
  }
  return "claude";
}

export function resolveFromPath(command, env = process.env, nodePath = process.execPath) {
  const home = env.HOME || "/tmp";
  const directories = [
    ...(env.PATH || "").split(delimiter).filter(Boolean),
    dirname(nodePath), join(home, ".local/bin"), join(home, ".npm-global/bin"),
    join(home, ".opencode/bin"), "/usr/local/bin", "/usr/bin",
  ];
  const versions = join(env.NVM_DIR || join(home, ".nvm"), "versions/node");
  try {
    for (const version of readdirSync(versions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      directories.push(join(versions, version, "bin"));
    }
  } catch {}
  for (const directory of directories) {
    const candidate = join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return command;
}

const DEFAULT_PATHS = {
  opencode: resolveFromPath("opencode"),
  codex: resolveFromPath("codex"),
  "claude-code": resolveClaudePath(),
};

const DEFAULT_PLATFORMS = {
  opencode: process.platform === "win32" ? "windows" : "wsl",
  codex: process.platform === "win32" ? "windows" : "wsl",
  "claude-code": process.platform === "win32" ? "windows" : "wsl",
};

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function loadConfig() {
  const generatedToken = !process.env.ZOTAGENT_TOKEN && !readArg("--token");
  const token =
    process.env.ZOTAGENT_TOKEN ||
    readArg("--token") ||
    randomBytes(24).toString("base64url");

  return {
    host: process.env.ZOTAGENT_HOST || readArg("--host") || "127.0.0.1",
    port: Number(process.env.ZOTAGENT_PORT || readArg("--port") || 24119),
    token,
    generatedToken,
    shell: shellDescriptor(),
    defaultCwd: process.env.ZOTAGENT_CWD || (process.platform === "win32" ? process.cwd() : process.env.HOME || "/tmp"),
    defaultWindowsCwd: process.env.ZOTAGENT_WIN_CWD || process.env.USERPROFILE || (process.platform === "win32" ? process.cwd() : "/mnt/c/Users"),
    executables: {
      opencode: process.env.ZOTAGENT_OPENCODE || DEFAULT_PATHS.opencode,
      codex: process.env.ZOTAGENT_CODEX || DEFAULT_PATHS.codex,
      "claude-code":
        process.env.ZOTAGENT_CLAUDE || DEFAULT_PATHS["claude-code"],
    },
    platforms: {
      opencode: process.env.ZOTAGENT_OPENCODE_PLATFORM || DEFAULT_PLATFORMS.opencode,
      codex: process.env.ZOTAGENT_CODEX_PLATFORM || DEFAULT_PLATFORMS.codex,
      "claude-code": process.env.ZOTAGENT_CLAUDE_PLATFORM || DEFAULT_PLATFORMS["claude-code"],
    },
    commands: {
      opencode: process.env.ZOTAGENT_OPENCODE_COMMAND || "opencode",
      codex: process.env.ZOTAGENT_CODEX_COMMAND || "codex",
      "claude-code": process.env.ZOTAGENT_CLAUDE_COMMAND || "claude",
    },
  };
}
