import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveFromPath } from "./config.js";
import { shellInvocation } from "./shell.js";

const execFileAsync = promisify(execFile);
const names = { opencode: "opencode", codex: "codex", "claude-code": "claude" };
const packages = { opencode: "opencode-ai", codex: "@openai/codex", "claude-code": "@anthropic-ai/claude-code" };
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
export const nativePlatform = process.platform === "win32" ? "windows" : "wsl";
export function agentPlatform(config, agent) {
  const value = config.platforms[agent];
  return value === "windows" || value === "wsl" ? value : nativePlatform;
}
export function pathMatchesPlatform(value, platform) {
  return platform === "windows" ? /^(?:[a-z]:[\\/]|\\\\(?!wsl[.$]))/i.test(value) : String(value).startsWith("/");
}
export function toWSLPath(value) {
  const match = String(value).match(/^([a-z]):[\\/](.*)$/i);
  if (match) return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
  const unc = String(value).match(/^\\\\wsl(?:\.localhost|\$)\\[^\\]+\\(.*)$/i);
  return unc ? "/" + unc[1].replaceAll("\\", "/") : value;
}
// Resolve standard npm shims via package metadata. Avoid cmd.exe reparsing
// arguments when npm actually installed a native binary or a JavaScript entry.
export function nativeInvocation(executable, args, agent, shell) {
  if (process.platform !== "win32") return shellInvocation(shell, executable, args);
  let entry = executable;
  if (/\.(?:cmd|bat|ps1)$/i.test(entry)) {
    try {
      const packageDir = path.join(path.dirname(entry), "node_modules", packages[agent]);
      const pkg = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
      const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[names[agent]];
      const candidate = bin && path.resolve(packageDir, bin);
      if (candidate && candidate.startsWith(packageDir + path.sep) && existsSync(candidate)) entry = candidate;
    } catch {}
  }
  if (/\.(?:c?js|mjs)$/i.test(entry)) return { command: process.execPath, args: [entry, ...args] };
  if (/\.exe$/i.test(entry)) return { command: entry, args };
  return shellInvocation({ name: "cmd" }, entry, args);
}

export function createAgentLauncher(config) {
  const discovered = new Map();
  async function resolve(agent) {
    const platform = agentPlatform(config, agent);
    const configured = String(config.executables[agent] || "");
    if (platform === nativePlatform) {
      const executable = pathMatchesPlatform(configured, platform) && existsSync(configured)
        ? configured : resolveFromPath(names[agent]);
      return { platform, executable, defaultCwd: config.defaultCwd };
    }
    if (process.platform !== "win32") throw new Error("从 WSL Runtime 启动 Windows Agent 暂不支持；请将后端启动位置设为 Windows，再分别选择 Agent 环境");
    const distro = config.wslDistro || "Ubuntu";
    const key = `${agent}:${distro}:${configured}`;
    if (!discovered.has(key)) {
      const command = pathMatchesPlatform(configured, "wsl") ? configured : names[agent];
      // The discovery shell prints only paths, never request text or secrets.
      // NVM may be absent from non-interactive login shells.
      const script = [
        'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
        '[ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"',
        'export PATH="$HOME/.local/bin:$HOME/.opencode/bin:$PATH"',
        `agent_path=$(command -v -- ${quote(command)})\n[ -x "$agent_path" ] || agent_path=$(command -v -- ${quote(names[agent])}) || exit 127`,
        '[ -x "$agent_path" ] || exit 127',
        'printf "\\n__ZOTAGENT_PATH__%s\\n__ZOTAGENT_HOME__%s\\n" "$agent_path" "$HOME"',
      ].join("\n");
      const task = execFileAsync("wsl.exe", ["-d", distro, "--exec", "/bin/bash", "-l", "-c", script], { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true })
        .then(({ stdout }) => {
          const executable = stdout.match(/__ZOTAGENT_PATH__([^\r\n]+)/)?.[1];
          const defaultCwd = stdout.match(/__ZOTAGENT_HOME__([^\r\n]+)/)?.[1];
          if (!executable || !defaultCwd || /\.(?:exe|cmd|bat)$/i.test(executable)) throw new Error(`WSL ${distro} 中未找到 Linux ${names[agent]}，请检查安装或填写其 Linux 绝对路径`);
          return { platform, executable, defaultCwd, distro };
        }).catch(error => { discovered.delete(key); throw new Error(`WSL ${distro} 检测 ${names[agent]} 失败：${error.stderr || error.message}`); });
      discovered.set(key, task);
    }
    return discovered.get(key);
  }
  function invocation(location, invocation, agent) {
    if (location.platform === nativePlatform) return { ...invocation, ...nativeInvocation(location.executable, invocation.args, agent, config.shell) };
    const environment = Object.entries(invocation.env || {}).map(([name, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid Agent environment variable name");
      return `export ${name}=${quote(value)}`;
    }).join("\n");
    const script = `export NVM_DIR="\${NVM_DIR:-$HOME/.nvm}"\n[ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"\nexport PATH="$HOME/.local/bin:$HOME/.opencode/bin:$PATH"\n${environment}\nexec ${[location.executable, ...invocation.args].map(quote).join(" ")}`;
    return { ...invocation, command: "wsl.exe", args: ["-d", location.distro, "--cd", invocation.cwd || location.defaultCwd, "--exec", "/bin/bash", "-l", "-c", script], cwd: config.defaultCwd };
  }
  return { resolve, invocation, clear: () => discovered.clear() };
}
