#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { loadConfig } from "./config.js";
import { statSync } from "node:fs";
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
  extractError,
  extractSessionID,
  createTextExtractor,
  extractModel,
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
import { ptyShellArgs } from "./shell.js";
import { createAgentLauncher, agentPlatform, nativePlatform, pathMatchesPlatform, toWSLPath } from "./agent-launch.js";

const config = loadConfig();
if (process.platform === "win32") {
  const { dirname, delimiter } = await import("node:path");
  process.env.Path = [dirname(process.execPath), process.env.APPDATA ? join(process.env.APPDATA, "npm") : "", process.env.Path || process.env.PATH || ""].filter(Boolean).join(delimiter);
}
let adapters = createAdapters(config.executables, config.platforms);
const running = new Map();
const launcher = createAgentLauncher(config);

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
  if (!isAbsolute(cwd) && !/^[a-z]:[\\/]/i.test(cwd)) throw new Error("cwd must be an absolute path");
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

const TEMP_DIR = join(process.env.ZOTAGENT_DATA_DIR || join(process.env.USERPROFILE || process.env.HOME || "/tmp", ".local/share/zotero-full-agent"), "tmp");

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

async function runAgent(request, response) {
  const location = await launcher.resolve(request.agent);
  if (response.destroyed || response.writableEnded) return;
  if (location.platform === "wsl" && process.platform === "win32") {
    request.cwd = request.cwd === config.defaultCwd ? location.defaultCwd : toWSLPath(request.cwd);
    if (!request.cwd.startsWith("/")) request.cwd = location.defaultCwd;
  } else if (!pathMatchesPlatform(request.cwd, location.platform)) request.cwd = location.defaultCwd;
  const ownedFiles = new Set();
  const cleanup = () => {
    for (const file of ownedFiles) { try { unlinkSync(file); } catch {} }
    ownedFiles.clear();
  };
  if (request.image && request.agent !== "claude-code") {
    const imagePath = saveImageToTemp(request.image);
    if (!imagePath) throw new Error("Invalid screenshot data");
    request.files.push(imagePath);
    ownedFiles.add(imagePath);
  }
  const adapter = createAdapters({ ...config.executables, [request.agent]: location.executable }, { ...config.platforms, [request.agent]: location.platform })[request.agent];
  let invocation;
  try {
    const mapped = location.platform === "wsl" && process.platform === "win32";
    const input = mapped && request.agent !== "claude-code" ? { ...request, files: request.files.map(toWSLPath) } : request;
    const built = adapter.buildInvocation(input);
    if (mapped && request.agent === "claude-code") built.args = built.args.map(toWSLPath);
    invocation = launcher.invocation(location, built, request.agent);
  }
  catch (error) { cleanup(); throw error; }
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

  let child;
  try { child = spawn(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: process.env,
    shell: false,
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  }); } catch (error) {
    cleanup();
    writeEvent(response, envelope(request, "error", { message: error.message }));
    writeEvent(response, envelope(request, "request.completed", { code: null, stderr: error.message }));
    response.end(); return;
  }
  let stderrTail = "", stdoutTail = "";
  let inputWritten = false, agentResponded = false, submissionSent = false;
  const confirmSubmission = () => {
    if (inputWritten && agentResponded && !submissionSent) {
      submissionSent = true;
      writeEvent(response, envelope(request, "input.submitted"));
    }
  };
  const extractVisibleText = createTextExtractor(request.agent);
  running.set(request.requestID, { child, request, response });

  const stdout = createInterface({ input: child.stdout });
  stdout.on("line", (line) => {
    if (!line) return;
    const raw = parseAgentLine(line);
    if (!raw || raw.type === "process.output") stdoutTail = (stdoutTail + line + "\n").slice(-4000);
    if (raw && raw.type !== "process.output") { agentResponded = true; confirmSubmission(); }
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
    const text = extractVisibleText(raw);
    if (text) {
      writeEvent(response, envelope(request, "message.delta", {
        text,
        nativeSessionID: request.nativeSessionID,
      }));
    }
    const model = extractModel(raw);
    if (model && model !== request.detectedModel) {
      request.detectedModel = model;
      writeEvent(response, envelope(request, "model.updated", { model }));
    }
    const eventType = classifyRawEvent(raw);
    writeEvent(response, envelope(request, eventType, {
      ...(eventType === "error" ? { message: extractError(raw) } : {}),
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
    if (code === 0) { agentResponded = true; confirmSubmission(); }
    running.delete(request.requestID);
    cleanup();
    writeEvent(response, envelope(request, "request.completed", {
      code,
      signal,
      stderr: stderrTail.trim() || (code !== 0 ? stdoutTail.trim() : "") || null,
      nativeSessionID: request.nativeSessionID,
    }));
    if (!response.writableEnded) response.end();
  });

  // Require both a written input pipe and native events (or successful exit).
  // A spawned shell alone does not prove the CLI received the input.
  child.stdin.on("error", (error) => {
    writeEvent(response, envelope(request, "error", { message: `Agent input failed: ${error.message}` }));
  });
  child.on("spawn", () => {
    const submitted = (error) => {
      if (!error) { inputWritten = true; confirmSubmission(); }
    };
    if (invocation.keepStdinOpen) child.stdin.write(invocation.stdin || "", submitted);
    else child.stdin.end(invocation.stdin ?? undefined, submitted);
  });

  response.on("close", () => {
    if (running.has(request.requestID)) {
      terminateProcess(child);
      running.delete(request.requestID);
    }
  });
}

async function collectVersion(adapter, agent) {
  let location;
  try { location = await launcher.resolve(agent); }
  catch (error) { return { available: false, platform: agentPlatform(config, agent), executable: "", error: error.message }; }
  return new Promise((resolve) => {
    const invocation = launcher.invocation(location, { command: location.executable, args: ["--version"], cwd: location.defaultCwd }, agent);
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      windowsHide: true,
      env: process.env,
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutOutput = "";
    let stderrOutput = "";
    const timeout = setTimeout(() => terminateProcess(child), 5000);
    child.stdout.on("data", (chunk) => (stdoutOutput += chunk));
    child.stderr.on("data", (chunk) => (stderrOutput += chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ available: false, platform: location.platform, executable: location.executable, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        available: code === 0,
        error: code === 0 ? null : (stderrOutput.trim() || stdoutOutput.trim() || `版本检测失败（退出码 ${code}，可能超时）`),
        version: stdoutOutput.trim().split(/\r?\n/).find(Boolean) || stderrOutput.trim().split(/\r?\n/).find(Boolean) || null,
        executable: location.executable,
        platform: location.platform,
        defaultCwd: location.defaultCwd,
        shell: config.shell,
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
      let cwdExists = null;
      const requestedCwd = url.searchParams.get("cwd");
      if (requestedCwd) {
        try { cwdExists = isAbsolute(requestedCwd) && statSync(requestedCwd).isDirectory(); }
        catch { cwdExists = false; }
      }
      writeJSON(response, 200, {
        status: "ok",
        protocolVersion: 3,
        platform: nativePlatform,
        wslDistro: process.env.WSL_DISTRO_NAME || null,
        cwdExists,
        pid: process.pid,
        runningRequests: running.size,
        defaultCwd: config.defaultCwd,
        shell: config.shell,
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/agents") {
      const entries = await Promise.all(
        Object.entries(adapters).map(async ([name, adapter]) => [
          name,
          {
            ...(await collectVersion(adapter, name)),
            shell: config.shell,
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
      const next = { ...config, platforms: { ...config.platforms }, executables: { ...config.executables } };
      if (typeof body.wslDistro === "string" && body.wslDistro.trim()) next.wslDistro = body.wslDistro.trim();
      for (const name of ["opencode", "codex", "claude-code"]) {
        const platform = body.platforms?.[name];
        if (["windows", "wsl", "auto"].includes(platform)) next.platforms[name] = platform;
        if (Object.hasOwn(body.executables || {}, name)) {
          const value = String(body.executables[name] || "").trim();
          // Empty resets detection, including stale paths from another host.
          if (value && !pathMatchesPlatform(value, agentPlatform(next, name))) throw new Error(`Invalid ${agentPlatform(next, name)} path for ${name}: ${value}`);
          next.executables[name] = value;
        }
      }
      Object.assign(config, next);
      launcher.clear();
      adapters = createAdapters(config.executables, config.platforms);
      writeJSON(response, 200, {
        status: "updated",
        executables: config.executables,
        platforms: config.platforms,
        commands: config.commands,
        shell: config.shell,
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/run") {
      await runAgent(validateRunRequest(await readJSON(request)), response);
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
      if (!active.child.stdin.writable) {
        writeJSON(response, 409, { error: "stdin is closed, approval not supported in this mode" });
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
      const location = await launcher.resolve(agent);
      const adapter = createAdapters({ ...config.executables, [agent]: location.executable }, { ...config.platforms, [agent]: location.platform })[agent];
      let cwd = String(body.cwd || "") || location.defaultCwd;
      if (location.platform === "wsl" && process.platform === "win32") cwd = cwd === config.defaultCwd ? location.defaultCwd : toWSLPath(cwd);
      if (!pathMatchesPlatform(cwd, location.platform)) cwd = location.defaultCwd;
      const interactive = adapter.interactiveArgs(body.sessionID || null, cwd);
      const ptyInvocation = launcher.invocation(location, interactive, agent);
      const session = createPtySession(ptyInvocation.command, ptyShellArgs(ptyInvocation), ptyInvocation.cwd, {}, { cols: body.cols, rows: body.rows });
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
    if (response.headersSent) { response.end(); }
    else writeJSON(response, 400, { error: error.message });
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
