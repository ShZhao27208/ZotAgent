import { AgentAdapter } from "./base.js";

export class CodexAdapter extends AgentAdapter {
  buildInvocation(request) {
    let args;
    if (request.nativeSessionID) {
      args = ["exec", "resume", "--json", "--skip-git-repo-check"];
      if (request.model) args.push("--model", request.model);
      args.push(request.nativeSessionID, "-");
    } else {
      args = [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--cd",
        request.cwd,
      ];
      if (request.model) args.push("--model", request.model);
      args.push("-");
    }
    for (const file of request.files || []) args.push("--image", file);
    return {
      command: this.executable,
      args,
      cwd: request.cwd,
      stdin: request.prompt,
      nativeSessionID: request.nativeSessionID || null,
    };
  }

  get supportsImages() { return true; }

  interactiveArgs(sessionID, cwd) {
    const args = ["--cd", cwd];
    if (sessionID) args.push("resume", sessionID);
    return { args, cwd };
  }
}
