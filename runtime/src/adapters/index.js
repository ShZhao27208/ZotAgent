import { OpenCodeAdapter } from "./opencode.js";
import { CodexAdapter } from "./codex.js";
import { ClaudeAdapter } from "./claude.js";

export function createAdapters(executables, platforms = {}) {
  return {
    opencode: new OpenCodeAdapter(executables.opencode, platforms.opencode || "wsl"),
    codex: new CodexAdapter(executables.codex, platforms.codex || "wsl"),
    "claude-code": new ClaudeAdapter(executables["claude-code"], platforms["claude-code"] || "wsl"),
  };
}
