import { randomUUID } from "node:crypto";
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
      "--output-format",
      "stream-json",
      "--verbose",
    ];
    if (images.length) args.push("--input-format", "stream-json");
    if (request.nativeSessionID) args.push("--resume", sessionID);
    else args.push("--session-id", sessionID);
    if (request.model) args.push("--model", request.model);
    // Images are embedded as bytes; no directory access grant is required.
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
    // Claude 2.1.282 hides sdk-* transcripts from a normal CLI picker.
    // Scope this compatibility setting to the terminal child; it exposes existing
    // SDK histories without rewriting transcripts or changing structured calls.
    return { args: ["--resume"], cwd, resumePicker: true, env: { CLAUDE_CODE_ENTRYPOINT: "sdk-cli" } };
  }

  sessionDirectory() {
    return process.env.HOME
      ? `${process.env.HOME}/.claude/projects`
      : null;
  }
}
