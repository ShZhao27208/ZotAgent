import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function resolveClaudePath() {
  // Scan NVM global modules for the Claude Code package
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

function resolveFromPath(command) {
  try {
    return execFileSync("which", [command], { encoding: "utf8" }).trim();
  } catch {
    return command;
  }
}

const DEFAULT_PATHS = {
  opencode: resolveFromPath("opencode"),
  codex: resolveFromPath("codex"),
  "claude-code": resolveClaudePath(),
};

const DEFAULT_PLATFORMS = {
  opencode: "wsl",
  codex: "wsl",
  "claude-code": "wsl",
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
    defaultCwd: process.env.ZOTAGENT_CWD || process.env.HOME || "/tmp",
    defaultWindowsCwd: process.env.ZOTAGENT_WIN_CWD || "/mnt/c/Users",
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
  };
}
