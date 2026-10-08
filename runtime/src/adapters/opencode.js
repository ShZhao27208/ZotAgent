import { AgentAdapter } from "./base.js";

export class OpenCodeAdapter extends AgentAdapter {
  buildInvocation(request) {
    const args = ["run", "--format", "json"];
    if (request.nativeSessionID) {
      args.push("--session", request.nativeSessionID);
    }
    const model = String(request.model || "").trim();
    if (model) {
      if (!/^[^\s/]+\/[^\s]+$/.test(model)) throw new Error("OpenCode 模型须为 provider/model ID；请在设置中的模型下拉菜单重新选择。");
      args.push("--model", model);
    }
    if (request.agentMode) args.push("--agent", request.agentMode);
    for (const file of request.files || []) args.push("--file", file);
    // stdin preserves multiline PDF text through Windows npm/Shell wrappers.
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
    // The process cwd already selects the project, in both structured and TUI modes.
    return { args: [], cwd };
  }
}
