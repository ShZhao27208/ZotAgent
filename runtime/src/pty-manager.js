import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const ptySessions = new Map();

export function createPtySession(agentCommand, args, cwd, env) {
  const id = randomUUID();
  const child = spawn(agentCommand, args, {
    cwd,
    env: { ...process.env, ...env, TERM: "xterm-256color", FORCE_COLOR: "1" },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const session = { id, child, alive: true };
  child.on("close", (code) => {
    session.alive = false;
    session.exitCode = code;
  });
  child.on("error", (err) => {
    session.alive = false;
    session.error = err.message;
  });
  ptySessions.set(id, session);
  return session;
}

export function getPtySession(id) {
  return ptySessions.get(id) || null;
}

export function writePtyInput(id, text) {
  const session = ptySessions.get(id);
  if (!session?.alive) return false;
  try {
    session.child.stdin.write(text);
    return true;
  } catch {
    return false;
  }
}

export function closePtySession(id) {
  const session = ptySessions.get(id);
  if (!session) return false;
  if (session.alive) {
    try {
      session.child.kill("SIGTERM");
    } catch {}
  }
  ptySessions.delete(id);
  return true;
}

export function listPtySessions() {
  return [...ptySessions.entries()].map(([id, s]) => ({
    id,
    alive: s.alive,
    exitCode: s.exitCode ?? null,
  }));
}
