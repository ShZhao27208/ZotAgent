import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { AgentAdapter } from "./base.js";

export class ClaudeAdapter extends AgentAdapter {
  buildInvocation(request) {
    const sessionID = request.nativeSessionID || randomUUID();
    const args = [
      "--print",
      "--input-format",
      "text",
      "--output-format",
      "stream-json",
      "--verbose",
    ];
    if (request.nativeSessionID) args.push("--resume", sessionID);
    else args.push("--session-id", sessionID);
    if (request.model) args.push("--model", request.model);
    for (const directory of new Set((request.files || []).map(dirname))) {
      args.push("--add-dir", directory);
    }
    return {
      command: this.executable,
      args,
      cwd: request.cwd,
      stdin: request.prompt,
      keepStdinOpen: false,
      nativeSessionID: sessionID,
    };
  }

  get supportsImages() { return true; }

  interactiveArgs(sessionID, cwd) {
    // Start the native TUI directly. Structured-session IDs are not guaranteed
    // to be resumable by an interactive Claude process.
    return { args: [], cwd };
  }

  sessionDirectory() {
    return process.env.HOME
      ? `${process.env.HOME}/.claude/projects`
      : null;
  }
}
