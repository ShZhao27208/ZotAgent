import { randomBytes } from "node:crypto";

const DEFAULT_PATHS = {
  opencode: "/home/shzhao/.nvm/versions/node/v24.18.0/bin/opencode",
  codex: "/home/shzhao/.nvm/versions/node/v24.18.0/bin/codex",
  "claude-code": "/home/shzhao/.nvm/versions/node/v24.18.0/bin/claude",
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
    defaultCwd: process.env.ZOTAGENT_CWD || "/home/shzhao",
    defaultWindowsCwd: process.env.ZOTAGENT_WIN_CWD || "/mnt/c/Users/ShZhao27208",
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
