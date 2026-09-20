export class AgentAdapter {
  constructor(executable, platform = "wsl") {
    this.executable = executable;
    this.platform = platform;
  }

  versionInvocation() {
    return { command: this.executable, args: ["--version"] };
  }

  optionalArgs(request) {
    const args = [];
    if (request.model) args.push("--model", request.model);
    return args;
  }

  get supportsImages() { return false; }
  get supportsApproval() { return false; }

  interactiveArgs(sessionID, cwd) {
    return { args: [], cwd };
  }

  resolveCwd(cwd, defaultWindowsCwd) {
    if (this.platform === "windows") {
      if (cwd && cwd.startsWith("/mnt/")) return cwd;
      return defaultWindowsCwd || "/mnt/c/Users";
    }
    return cwd;
  }
}
