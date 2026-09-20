#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { loadConfig, resolveClaudePath } from "./config.js";
import { existsSync } from "node:fs";
import {
  envelope,
  isAuthorized,
  readJSON,
  startNDJSON,
  writeEvent,
  writeJSON,
} from "./protocol.js";
import { createAdapters } from "./adapters/index.js";
import {
  classifyRawEvent,
  extractSessionID,
  extractText,
  parseAgentLine,
} from "./normalize.js";
import { listSessions, upsertSession, deleteSession } from "./sessions.js";
import {
  createPtySession,
  getPtySession,
  writePtyInput,
  closePtySession,
  listPtySessions,
  subscribePtySession,
  resizePtySession,
} from "./pty-manager.js";

const config = loadConfig();
let adapters = createAdapters(config.executables, config.platforms);
const running = new Map();

function validateRunRequest(body) {
  const agent = String(body.agent || "");
  if (!adapters[agent]) throw new Error(`Unsupported agent: ${agent}`);
  const prompt = String(body.prompt || "");
  if (!prompt.trim()) throw new Error("prompt is required");
  const adapter = adapters[agent];
  const rawCwd = String(body.cwd || "");
  const cwd = adapter.resolveCwd(
    rawCwd || (adapter.platform === "windows" ? config.defaultWindowsCwd : config.defaultCwd),
    config.defaultWindowsCwd,
  );
  if (!isAbsolute(cwd)) throw new Error("cwd must be an absolute path");
  return {
    requestID: String(body.requestID || randomUUID()),
    windowID: String(body.windowID || "unknown-window"),
    agent,
    prompt,
    cwd,
    model: body.model ? String(body.model) : null,
    agentMode: body.agentMode ? String(body.agentMode) : null,
    nativeSessionID: body.nativeSessionID
      ? String(body.nativeSessionID)
      : null,
    files: Array.isArray(body.files) ? body.files.map(String) : [],
    image: body.image ? String(body.image) : null,
  };
}

const TEMP_DIR = join(
  process.env.HOME || "/tmp",
  ".local/share/zotero-full-agent/tmp",
);

function saveImageToTemp(dataURL) {
  mkdirSync(TEMP_DIR, { recursive: true });
  const match = dataURL.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  const filename = `capture-${randomUUID()}.${ext}`;
  const filePath = join(TEMP_DIR, filename);
  writeFileSync(filePath, buffer);
  return filePath;
}

function terminateProcess(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function runAgent(request, response) {
  if (request.image) {
    const imagePath = saveImageToTemp(request.image);
    if (imagePath) request.files.push(imagePath);
  }
  const adapter = adapters[request.agent];
  const invocation = adapter.buildInvocation(request);
  if (invocation.nativeSessionID) {
    request.nativeSessionID = invocation.nativeSessionID;
  }

  startNDJSON(response);
  writeEvent(response, envelope(request, "request.started", {
    cwd: request.cwd,
    nativeSessionID: request.nativeSessionID,
  }));
  if (request.nativeSessionID) {
    writeEvent(response, envelope(request, "session.updated", {
      nativeSessionID: request.nativeSessionID,
    }));
    upsertSession({
      agent: request.agent,
      nativeSessionID: request.nativeSessionID,
      windowID: request.windowID,
      cwd: request.cwd,
      createdAt: new Date().toISOString(),
    });
  }

  const child = spawn(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: process.env,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderrTail = "";
  running.set(request.requestID, { child, request, response });

  const stdout = createInterface({ input: child.stdout });
  stdout.on("line", (line) => {
    if (!line) return;
    const raw = parseAgentLine(line);
    const sessionID = extractSessionID(raw);
    if (sessionID && sessionID !== request.nativeSessionID) {
      request.nativeSessionID = sessionID;
      writeEvent(response, envelope(request, "session.updated", {
        nativeSessionID: sessionID,
      }));
      upsertSession({
        agent: request.agent,
        nativeSessionID: sessionID,
        windowID: request.windowID,
        cwd: request.cwd,
      });
    }
    const text = extractText(raw);
    if (text) {
      writeEvent(response, envelope(request, "message.delta", {
        text,
        nativeSessionID: request.nativeSessionID,
      }));
    }
    writeEvent(response, envelope(request, classifyRawEvent(raw), {
      raw,
      nativeSessionID: request.nativeSessionID,
    }));
  });

  const stderr = createInterface({ input: child.stderr });
  stderr.on("line", (line) => {
    if (line) {
      stderrTail = (stderrTail + line + "\n").slice(-4000);
      writeEvent(response, envelope(request, "process.stderr", { line }));
    }
  });

  child.on("error", (error) => {
    writeEvent(response, envelope(request, "error", { message: error.message }));
  });

  child.on("close", (code, signal) => {
    running.delete(request.requestID);
    for (const file of (request.files || [])) {
      if (file.includes("/zotero-full-agent/tmp/")) {
        try { unlinkSync(file); } catch {}
      }
    }
    writeEvent(response, envelope(request, "request.completed", {
      code,
      signal,
      stderr: stderrTail.trim() || null,
      nativeSessionID: request.nativeSessionID,
    }));
    if (!response.writableEnded) response.end();
  });

  if (invocation.stdin !== null && invocation.stdin !== undefined) {
    child.stdin.write(invocation.stdin);
    if (!invocation.keepStdinOpen) child.stdin.end();
  } else {
    if (!invocation.keepStdinOpen) child.stdin.end();
  }

  response.on("close", () => {
    if (running.has(request.requestID)) {
      terminateProcess(child);
      running.delete(request.requestID);
    }
  });
}

function collectVersion(adapter) {
  return new Promise((resolve) => {
    const invocation = adapter.versionInvocation();
    const child = spawn(invocation.command, invocation.args, {
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => terminateProcess(child), 5000);
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ available: false, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        available: code === 0,
        version: output.trim().split(/\r?\n/).find(Boolean) || null,
        executable: invocation.command,
      });
    });
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    });
    response.end();
    return;
  }

  if (!isAuthorized(request, config.token)) {
    writeJSON(response, 401, { error: "unauthorized" });
    return;
  }

  try {
    const url = new URL(request.url, `http://${config.host}:${config.port}`);
    if (request.method === "GET" && url.pathname === "/v1/health") {
      writeJSON(response, 200, {
        status: "ok",
        pid: process.pid,
        runningRequests: running.size,
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/agents") {
      const entries = await Promise.all(
        Object.entries(adapters).map(async ([name, adapter]) => [
          name,
          {
            ...(await collectVersion(adapter)),
            platform: adapter.platform,
            supportsImages: adapter.supportsImages,
            supportsApproval: adapter.supportsApproval,
          },
        ]),
      );
      writeJSON(response, 200, Object.fromEntries(entries));
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/config/agents") {
      const body = await readJSON(request);
      for (const name of ["opencode", "codex", "claude-code"]) {
        const executable = body.executables?.[name];
        if (executable !== undefined && executable !== null) {
          const str = String(executable).trim();
          if (str) {
            if (!isAbsolute(str)) {
              throw new Error(`${name} executable must be an absolute path`);
            }
            config.executables[name] = name === "claude-code" && !existsSync(str)
              ? resolveClaudePath()
              : str;
          }
        }
        const platform = body.platforms?.[name];
        if (platform === "windows" || platform === "wsl") {
          config.platforms[name] = platform;
        }
      }
      adapters = createAdapters(config.executables, config.platforms);
      writeJSON(response, 200, {
        status: "updated",
        executables: config.executables,
        platforms: config.platforms,
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/run") {
      runAgent(validateRunRequest(await readJSON(request)), response);
      return;
    }
    const cancelMatch = url.pathname.match(/^\/v1\/requests\/([^/]+)\/cancel$/);
    if (request.method === "POST" && cancelMatch) {
      const requestID = decodeURIComponent(cancelMatch[1]);
      const active = running.get(requestID);
      if (!active) {
        writeJSON(response, 404, { error: "request not found" });
        return;
      }
      terminateProcess(active.child);
      writeJSON(response, 202, { status: "cancelling", requestID });
      return;
    }
    const approveMatch = url.pathname.match(/^\/v1\/requests\/([^/]+)\/approve$/);
    if (request.method === "POST" && approveMatch) {
      const requestID = decodeURIComponent(approveMatch[1]);
      const active = running.get(requestID);
      if (!active) {
        writeJSON(response, 404, { error: "request not found" });
        return;
      }
      const body = await readJSON(request);
      const input = body.approved ? "y\n" : "n\n";
      try {
        active.child.stdin.write(input);
      } catch {
        writeJSON(response, 500, { error: "failed to write to agent stdin" });
        return;
      }
      writeJSON(response, 200, { status: "sent", approved: body.approved });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/sessions") {
      const agent = url.searchParams.get("agent") || null;
      writeJSON(response, 200, { sessions: listSessions(agent) });
      return;
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/v1/sessions/")) {
      const parts = url.pathname.split("/");
      const agent = decodeURIComponent(parts[3] || "");
      const sessionID = decodeURIComponent(parts[4] || "");
      if (!agent || !sessionID) {
        writeJSON(response, 400, { error: "agent and sessionID required" });
        return;
      }
      const deleted = deleteSession(agent, sessionID);
      writeJSON(response, deleted ? 200 : 404, { deleted });
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/pty/create") {
      const body = await readJSON(request);
      const agent = String(body.agent || "");
      if (!adapters[agent]) {
        writeJSON(response, 400, { error: `Unsupported agent: ${agent}` });
        return;
      }
      const adapter = adapters[agent];
      const rawCwd = String(body.cwd || "");
      const cwd = adapter.resolveCwd(
        rawCwd || (adapter.platform === "windows" ? config.defaultWindowsCwd : config.defaultCwd),
        config.defaultWindowsCwd,
      );
      const interactive = adapter.interactiveArgs(body.sessionID || null, cwd);
      const session = createPtySession(adapter.executable, interactive.args, interactive.cwd, {}, { cols: body.cols, rows: body.rows });
      writeJSON(response, 200, { ptyID: session.id, agent, cwd });
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/pty/write") {
      const body = await readJSON(request);
      const ok = writePtyInput(String(body.ptyID || ""), String(body.input || ""));
      writeJSON(response, ok ? 200 : 404, { written: ok });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/pty/read") {
      const ptyID = url.searchParams.get("id");
      const session = getPtySession(ptyID);
      if (!session) {
        writeJSON(response, 404, { error: "pty session not found" });
        return;
      }
      startNDJSON(response);
      const onData = (data, state) => {
        if (data) writeEvent(response, { type: "pty.output", data, ptyID });
        if (state && !response.writableEnded) {
          writeEvent(response, { type: "pty.closed", code: state.exitCode, signal: state.signal, ptyID });
          response.end();
        }
      };
      const unsubscribe = subscribePtySession(ptyID, onData);
      response.on("close", () => {
        unsubscribe?.();
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/pty/resize") {
      const body = await readJSON(request);
      const resized = resizePtySession(String(body.ptyID || ""), body.cols, body.rows);
      writeJSON(response, resized ? 200 : 404, { resized });
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/pty/close") {
      const body = await readJSON(request);
      const closed = closePtySession(String(body.ptyID || ""));
      writeJSON(response, closed ? 200 : 404, { closed });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/pty/list") {
      writeJSON(response, 200, { sessions: listPtySessions() });
      return;
    }
    writeJSON(response, 404, { error: "not found" });
  } catch (error) {
    writeJSON(response, 400, { error: error.message });
  }
});

server.on("error", (error) => {
  process.stderr.write(`[ZotAgent Runtime] server error: ${error.message}\n`);
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  process.stderr.write(
    `[ZotAgent Runtime] listening on http://${config.host}:${config.port}\n`,
  );
  if (config.generatedToken) {
    process.stderr.write(`[ZotAgent Runtime] generated token: ${config.token}\n`);
  }
});

function shutdown() {
  for (const { child } of running.values()) terminateProcess(child);
  for (const session of listPtySessions()) closePtySession(session.id);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
