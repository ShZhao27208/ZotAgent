import { randomUUID } from "node:crypto";
import pty from "node-pty";

const ptySessions = new Map();

export function createPtySession(agentCommand, args, cwd, env, options = {}) {
  const id = randomUUID();
  const session = { id, alive: true, exitCode: null, output: "", subscribers: new Set() };
  const terminal = pty.spawn(agentCommand, args, {
    name: "xterm-256color", cols: Number(options.cols) || 120, rows: Number(options.rows) || 36,
    cwd, env: { ...process.env, ...env, TERM: "xterm-256color", FORCE_COLOR: "1" },
  });
  session.terminal = terminal;
  terminal.onData((data) => {
    session.output = (session.output + data).slice(-256 * 1024);
    for (const subscriber of session.subscribers) subscriber(data);
  });
  terminal.onExit(({ exitCode, signal }) => {
    session.alive = false; session.exitCode = exitCode; session.signal = signal || null;
    for (const subscriber of session.subscribers) subscriber(null, session);
    session.subscribers.clear();
  });
  ptySessions.set(id, session);
  return session;
}

export function getPtySession(id) { return ptySessions.get(id) || null; }

export function writePtyInput(id, text) {
  const session = ptySessions.get(id);
  if (!session?.alive) return false;
  try { session.terminal.write(text); return true; } catch { return false; }
}

export function resizePtySession(id, cols, rows) {
  const session = ptySessions.get(id);
  if (!session?.alive) return false;
  try { session.terminal.resize(Math.max(20, Number(cols) || 120), Math.max(5, Number(rows) || 36)); return true; }
  catch { return false; }
}

export function subscribePtySession(id, listener) {
  const session = ptySessions.get(id);
  if (!session) return null;
  if (session.output) listener(session.output);
  if (session.alive) session.subscribers.add(listener); else listener(null, session);
  return () => session.subscribers.delete(listener);
}

export function closePtySession(id) {
  const session = ptySessions.get(id);
  if (!session) return false;
  if (session.alive) { try { session.terminal.kill(); } catch {} }
  for (const subscriber of session.subscribers) {
    try { subscriber(null, { exitCode: session.exitCode, signal: "cleanup" }); } catch {}
  }
  session.subscribers.clear();
  ptySessions.delete(id);
  return true;
}

export function listPtySessions() {
  return [...ptySessions.values()].map((session) => ({ id: session.id, alive: session.alive, exitCode: session.exitCode, agent: session.agent, nativeSessionID: session.nativeSessionID, resumePicker: session.resumePicker === true }));
}
