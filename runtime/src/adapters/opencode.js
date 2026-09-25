import { AgentAdapter } from "./base.js";

export class OpenCodeAdapter extends AgentAdapter {
  buildInvocation(request) {
    const args = ["run", "--format", "json", "--dir", request.cwd];
    if (request.nativeSessionID) {
      args.push("--session", request.nativeSessionID);
    }
    const model = String(request.model || "").trim();
    if (model) {
      if (!/^[^\s/]+\/[^\s]+$/.test(model)) throw new Error("OpenCode 模型须填写 provider/model ID，例如 opencode/mimo-v2.6-flash-free；不能填写界面显示名称。请在相同环境运行 opencode models 核对，或留空使用 CLI 配置。");
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
    // Top-level OpenCode uses the optional project positional argument. The
    // --dir flag belongs to `run` and makes the TUI print help/exit 1.
    return { args: [cwd], cwd };
  }
}
