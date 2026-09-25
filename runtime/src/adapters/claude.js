import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import { AgentAdapter } from "./base.js";

export class ClaudeAdapter extends AgentAdapter {
  buildInvocation(request) {
    const images = [];
    if (request.image) {
      const match = request.image.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
      if (!match) throw new Error("Unsupported image data; expected PNG, JPEG, GIF or WebP");
      images.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
    }
    for (const file of request.files || []) {
      const extension = file.split(".").at(-1).toLowerCase();
      const media = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[extension];
      if (media) images.push({ type: "image", source: { type: "base64", media_type: media, data: readFileSync(file).toString("base64") } });
    }
    const sessionID = request.nativeSessionID || randomUUID();
    const args = [
      "--print",
      "--input-format",
      images.length ? "stream-json" : "text",
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
      stdin: images.length ? JSON.stringify({ type: "user", message: { role: "user", content: [
        { type: "text", text: request.prompt }, ...images,
      ] } }) + "\n" : request.prompt,
      keepStdinOpen: false,
      nativeSessionID: sessionID,
    };
  }

  get supportsImages() { return true; }

  interactiveArgs(sessionID, cwd) {
    // --print sessions are persisted by the CLI and can be resumed by ID.
    return { args: sessionID ? ["--resume", sessionID] : [], cwd };
  }

  sessionDirectory() {
    return process.env.HOME
      ? `${process.env.HOME}/.claude/projects`
      : null;
  }
}
