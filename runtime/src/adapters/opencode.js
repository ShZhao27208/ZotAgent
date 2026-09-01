import { AgentAdapter } from "./base.js";

export class OpenCodeAdapter extends AgentAdapter {
  buildInvocation(request) {
    const args = ["run", "--format", "json", "--dir", request.cwd];
    if (request.nativeSessionID) {
      args.push("--session", request.nativeSessionID);
    }
    if (request.model) args.push("--model", request.model);
    if (request.agentMode) args.push("--agent", request.agentMode);
    for (const file of request.files || []) args.push("--file", file);
    args.push(request.prompt);
    return {
      command: this.executable,
      args,
      cwd: request.cwd,
      stdin: null,
      nativeSessionID: request.nativeSessionID || null,
    };
  }

  interactiveArgs(sessionID, cwd) {
    // The interactive TUI accepts no subcommand; --dir only works with `run`.
    return { args: [], cwd };
  }
}
