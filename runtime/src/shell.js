import { basename } from "node:path";

function shellName(value) {
  return basename(String(value || "").replaceAll("\\", "/")).toLowerCase().replace(/\.exe$/, "");
}

export function detectShell(env = process.env, platform = process.platform) {
  const requested = shellName(env.ZOTAGENT_SHELL);
  if (requested) return requested;
  if (platform === "win32") {
    const comspec = shellName(env.ComSpec || env.COMSPEC);
    return comspec === "cmd" ? "cmd" : "powershell";
  }
  return shellName(env.SHELL) || "bash";
}

export function shellDescriptor(env = process.env, platform = process.platform) {
  const name = detectShell(env, platform);
  const distro = env.WSL_DISTRO_NAME || null;
  if (name === "cmd") return { name, platform: "windows", distro, login: false, interactive: false };
  if (name === "powershell" || name === "pwsh") {
    return { name: "powershell", platform: "windows", distro, login: true, interactive: false };
  }
  return { name, platform: platform === "win32" ? "windows" : "wsl", distro, login: true, interactive: true };
}

function quotePosix(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }
function quotePowerShell(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function quoteCmd(value) { return `"${String(value).replaceAll("%", "%%").replaceAll('"', '\\"')}"`; }

export function shellInvocation(shell, command, args = []) {
  const name = shell?.name || detectShell();
  if (name === "cmd") {
    const line = `"${[command, ...args].map(quoteCmd).join(" ")}"`;
    return { command: process.env.ComSpec || "cmd.exe", args: ["/s", "/c", line], windowsVerbatimArguments: true };
  }
  if (name === "powershell" || name === "pwsh") {
    const line = ["&", quotePowerShell(command), ...args.map(quotePowerShell)].join(" ");
    return { command: name === "pwsh" ? "pwsh" : "powershell.exe", args: ["-NoLogo", "-Command", line] };
  }
  // Shell startup files can change directory. Reassert the inherited cwd before
  // exec so removing redundant CLI directory flags cannot change the project.
  return { command: name, args: ["-l", "-i", "-c", 'cd -- "$1" || exit 1\nexec ' + [quotePosix(command), ...args.map(quotePosix)].join(" "), "zotagent", "__ZOTAGENT_CWD__"] };
}

export function shellCommandName(executable, configured) {
  return String(configured || basename(String(executable || "")));
}

export function ptyShellArgs(invocation, platform = process.platform) {
  return platform === "win32" && invocation.windowsVerbatimArguments
    ? invocation.args.join(" ") : invocation.args;
}
