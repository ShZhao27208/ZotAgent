import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { resolveClaudePath, resolveFromPath } from "./config.js";
import { shellInvocation } from "./shell.js";

const execFileAsync = promisify(execFile);
const names = { opencode: "opencode", codex: "codex", "claude-code": "claude" };
const packages = { opencode: "opencode-ai", codex: "@openai/codex", "claude-code": "@anthropic-ai/claude-code" };
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const quotePowerShell = value => "'" + String(value).replaceAll("'", "''") + "'";
export const nativePlatform = process.platform === "win32" ? "windows" : "wsl";
// A Linux Runtime can start Windows programs only inside WSL with interop enabled.
const windowsInterop = process.platform === "linux" && (Boolean(process.env.WSL_DISTRO_NAME) || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop"));
const otherPlatform = nativePlatform === "windows" ? "wsl" : "windows";
const POWERSHELL = ["/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"].find(existsSync) || "powershell.exe";

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
export function toWindowsPath(value, distro = process.env.WSL_DISTRO_NAME || "Ubuntu") {
  const text = String(value);
  const drive = text.match(/^\/mnt\/([a-z])(?:\/(.*))?$/i);
  if (drive) return `${drive[1].toUpperCase()}:\\${(drive[2] || "").replaceAll("/", "\\")}`;
  return text.startsWith("/") ? `\\\\wsl.localhost\\${distro}${text.replaceAll("/", "\\")}` : text;
}

// Resolve standard npm shims via package metadata so cmd.exe never reparses
// arguments when npm actually installed a native binary or a JavaScript entry.
function npmEntry(executable, agent, toLocal = value => value) {
  if (!/\.(?:cmd|bat|ps1)$/i.test(executable)) return executable;
  const win = path.win32;
  try {
    const packageDir = win.join(win.dirname(executable), "node_modules", packages[agent]);
    const pkg = JSON.parse(readFileSync(toLocal(win.join(packageDir, "package.json")), "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[names[agent]];
    const candidate = bin && win.resolve(packageDir, bin);
    if (candidate && candidate.startsWith(packageDir + win.sep) && existsSync(toLocal(candidate))) return candidate;
  } catch {}
  return executable;
}

export function nativeInvocation(executable, args, agent, shell) {
  if (process.platform !== "win32") return shellInvocation(shell, executable, args);
  const entry = npmEntry(executable, agent);
  if (/\.(?:c?js|mjs)$/i.test(entry)) return { command: process.execPath, args: [entry, ...args] };
  if (/\.exe$/i.test(entry)) return { command: entry, args };
  return shellInvocation({ name: "cmd" }, entry, args);
}

// WSL interop rebuilds the Windows command line from argv, so programs are
// started directly; only an unresolved batch shim goes through PowerShell.
function windowsInvocation(location, invocation, agent) {
  const entry = npmEntry(location.executable, agent, toWSLPath);
  const cwd = toWSLPath(invocation.cwd || location.defaultCwd);
  const envNames = Object.keys(invocation.env || {});
  if (envNames.some(name => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) throw new Error("Invalid Agent environment variable name");
  // WSLENV forwards only the listed variables to the Windows process.
  const env = envNames.length ? { ...invocation.env, WSLENV: [process.env.WSLENV, ...envNames].filter(Boolean).join(":") } : invocation.env;
  if (/\.exe$/i.test(entry)) return { ...invocation, command: toWSLPath(entry), args: invocation.args, cwd, env };
  if (/\.(?:c?js|mjs)$/i.test(entry) && location.node) return { ...invocation, command: toWSLPath(location.node), args: [entry, ...invocation.args], cwd, env };
  const script = `& ${[entry, ...invocation.args].map(quotePowerShell).join(" ")}; exit $LASTEXITCODE`;
  return { ...invocation, command: POWERSHELL, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], cwd, env };
}

export function createAgentLauncher(config) {
  const discovered = new Map();
  const configuredPath = (platform, agent) => {
    const value = String(config.executables?.[platform]?.[agent] || "");
    return value === names[agent] ? "" : value;
  };
  const cached = (key, task) => {
    if (!discovered.has(key)) discovered.set(key, task().catch(error => { discovered.delete(key); throw error; }));
    return discovered.get(key);
  };

  function locateNative(agent, configured) {
    if (configured) {
      if (!pathMatchesPlatform(configured, nativePlatform) || !existsSync(configured) || !statSync(configured).isFile()) {
        throw new Error(`手动配置的 ${names[agent]} 路径无效：${configured}；请修正路径或清空后重新检测`);
      }
      return { platform: nativePlatform, executable: configured, defaultCwd: config.defaultCwd };
    }
    const executable = agent === "claude-code" ? resolveClaudePath() : resolveFromPath(names[agent]);
    // WSL PATH also lists Windows npm directories; those shims belong to the Windows system.
    if (!path.isAbsolute(executable) || nativePlatform === "wsl" && /^\/mnt\/[a-z]\//i.test(executable)) throw new Error(`${nativePlatform === "windows" ? "Windows" : "WSL"} 中未找到 ${names[agent]}，请检查安装或填写其绝对路径`);
    return { platform: nativePlatform, executable, defaultCwd: config.defaultCwd };
  }

  // The discovery shell prints only paths, never request text or secrets.
  // NVM may be absent from non-interactive login shells.
  function discoverWSL(command, distro) {
    const script = [
      'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
      '[ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"',
      'export PATH="$HOME/.local/bin:$HOME/.opencode/bin:$PATH"',
      `agent_path=$(command -v -- ${quote(command)}) || exit 127`,
      '[ -x "$agent_path" ] || exit 127',
      'printf "\\n__ZOTAGENT_PATH__%s\\n__ZOTAGENT_HOME__%s\\n" "$agent_path" "$HOME"',
    ].join("\n");
    return execFileAsync("wsl.exe", ["-d", distro, "--exec", "/bin/bash", "-l", "-c", script], { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true })
      .then(({ stdout }) => ({ executable: stdout.match(/__ZOTAGENT_PATH__([^\r\n]+)/)?.[1], defaultCwd: stdout.match(/__ZOTAGENT_HOME__([^\r\n]+)/)?.[1] }));
  }

  function locateWSL(agent, configured) {
    if (process.platform !== "win32") throw new Error("当前 Runtime 不在 Windows 上，无法通过 wsl.exe 启动 WSL Agent");
    const distro = config.wslDistro || "Ubuntu";
    return cached(`wsl:${agent}:${distro}:${configured}`, async () => {
      if (configured && !pathMatchesPlatform(configured, "wsl")) throw new Error(`手动配置路径不是 WSL 绝对路径：${configured}`);
      try {
        const { executable, defaultCwd } = await discoverWSL(configured || names[agent], distro);
        if (!executable || !defaultCwd || /\.(?:cmd|bat)$/i.test(executable) || /^\/mnt\/[a-z]\//i.test(executable) && /\.exe$/i.test(executable)) throw new Error(`WSL ${distro} 中未找到 Linux ${names[agent]}，请检查安装或填写其 Linux 绝对路径`);
        return { platform: "wsl", executable, defaultCwd, distro };
      } catch (error) { throw new Error(`WSL ${distro} 检测 ${names[agent]} 失败：${error.stderr || error.message}`); }
    });
  }

  // One PowerShell call reports the Windows home, Node and every Agent CLI.
  function windowsInventory() {
    return cached("windows:inventory", async () => {
      const script = [
        "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='SilentlyContinue'",
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8",
        "'__HOME__' + $env:USERPROFILE",
        "foreach ($n in 'node','opencode','codex','claude') {",
        "  $p = Get-Command -Name $n -CommandType Application | Where-Object { $_.Source -match '\\.(exe|cmd|bat)$' } | Select-Object -First 1 -ExpandProperty Source",
        "  if (-not $p) { $p = @(\"$env:APPDATA\\npm\\$n.cmd\", \"$env:USERPROFILE\\.local\\bin\\$n.exe\", \"$env:USERPROFILE\\.opencode\\bin\\$n.exe\") | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1 }",
        "  '__' + $n + '__' + $p",
        "}",
      ].join("\n");
      const { stdout } = await execFileAsync(POWERSHELL, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { cwd: "/mnt/c", timeout: 15000, maxBuffer: 1024 * 1024 });
      const value = key => stdout.match(new RegExp(`__${key}__([^\\r\\n]*)`))?.[1]?.trim() || "";
      const home = value("HOME");
      if (!pathMatchesPlatform(home, "windows")) throw new Error("无法读取 Windows 用户目录");
      return { home, paths: Object.fromEntries(["node", "opencode", "codex", "claude"].map(name => [name, value(name)])) };
    });
  }

  async function locateWindows(agent, configured) {
    if (!windowsInterop) throw new Error("当前 Runtime 不在 WSL 中或未启用 Windows 互操作，无法启动 Windows Agent");
    if (configured && (!pathMatchesPlatform(configured, "windows") || !existsSync(toWSLPath(configured)))) {
      throw new Error(`手动配置的 Windows ${names[agent]} 路径无效：${configured}；请修正路径或清空后重新检测`);
    }
    let inventory;
    try { inventory = await windowsInventory(); }
    catch (error) { throw new Error(`Windows 检测 ${names[agent]} 失败：${error.message}`); }
    const executable = configured || inventory.paths[names[agent]];
    if (!executable) throw new Error(`Windows 中未找到 ${names[agent]}，请检查安装或填写其 Windows 绝对路径`);
    return { platform: "windows", executable, defaultCwd: inventory.home, node: inventory.paths.node || null };
  }

  function locate(agent, platform) {
    const configured = configuredPath(platform, agent);
    if (platform === nativePlatform) return Promise.resolve().then(() => locateNative(agent, configured));
    return platform === "wsl" ? locateWSL(agent, configured) : locateWindows(agent, configured);
  }

  // `prefer` keeps an automatic Agent on the system that owns a resumed session.
  async function resolve(agent, { prefer = null } = {}) {
    const selected = config.platforms[agent];
    if (selected === "windows" || selected === "wsl") return locate(agent, selected);
    const first = prefer === otherPlatform ? otherPlatform : nativePlatform;
    const second = first === nativePlatform ? otherPlatform : nativePlatform;
    const reachable = platform => platform === nativePlatform || (platform === "windows" ? windowsInterop : process.platform === "win32");
    // Automatic selection prefers this Runtime's system and falls back to the
    // other system, unless a manual path pins the Agent to the first system.
    try { return await locate(agent, first); }
    catch (firstError) {
      if (configuredPath(first, agent) || !reachable(second)) throw firstError;
      try { return await locate(agent, second); }
      catch (secondError) { throw new Error(`${firstError.message}；${secondError.message}`); }
    }
  }

  // Report every installation without failing when one system lacks the CLI.
  async function discoverAll(agent) {
    const platforms = [nativePlatform, ...(otherPlatform === "windows" ? windowsInterop : process.platform === "win32") ? [otherPlatform] : []];
    const results = await Promise.allSettled(platforms.map(platform => locate(agent, platform)));
    return Object.fromEntries(platforms.map((platform, index) => [platform, results[index].status === "fulfilled" ? results[index].value.executable : null]));
  }

  async function resolveNode(platform) {
    if (platform === nativePlatform) return process.execPath;
    if (platform === "windows") return windowsInterop ? (await windowsInventory()).paths.node || null : null;
    if (process.platform !== "win32") return null;
    const distro = config.wslDistro || "Ubuntu";
    return cached(`wsl:node:${distro}`, async () => (await discoverWSL("node", distro)).executable || null);
  }

  function invocation(location, invocation, agent) {
    if (location.platform === nativePlatform) {
      const built = nativeInvocation(location.executable, invocation.args, agent, config.shell);
      if (built.args.at(-1) === "__ZOTAGENT_CWD__") built.args[built.args.length - 1] = invocation.cwd || location.defaultCwd;
      return { ...invocation, ...built };
    }
    if (location.platform === "windows") return windowsInvocation(location, invocation, agent);
    const environment = Object.entries(invocation.env || {}).map(([name, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid Agent environment variable name");
      return `export ${name}=${quote(value)}`;
    }).join("\n");
    const script = `export NVM_DIR="\${NVM_DIR:-$HOME/.nvm}"\n[ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"\nexport PATH="$HOME/.local/bin:$HOME/.opencode/bin:$PATH"\n${environment}\ncd -- ${quote(invocation.cwd || location.defaultCwd)} || exit 1\nexec ${[location.executable, ...invocation.args].map(quote).join(" ")}`;
    return { ...invocation, command: "wsl.exe", args: ["-d", location.distro, "--cd", invocation.cwd || location.defaultCwd, "--exec", "/bin/bash", "-l", "-c", script], cwd: config.defaultCwd };
  }
  return { resolve, locate, discoverAll, resolveNode, invocation, clear: () => discovered.clear() };
}
