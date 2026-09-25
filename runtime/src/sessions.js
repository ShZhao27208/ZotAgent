import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const STORE_DIR = process.env.ZOTAGENT_DATA_DIR || join(
  process.env.USERPROFILE || process.env.HOME || "/tmp",
  ".local/share/zotero-full-agent",
);
const STORE_PATH = join(STORE_DIR, "sessions.json");

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(STORE_PATH, "utf8"));
  } catch {
    cache = { sessions: [] };
  }
  return cache;
}

function save() {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const tmp = STORE_PATH + "." + randomUUID().slice(0, 8) + ".tmp";
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  renameSync(tmp, STORE_PATH);
}

export function listSessions(agent) {
  const data = load();
  if (!agent) return data.sessions;
  return data.sessions.filter((s) => s.agent === agent);
}

export function upsertSession(record) {
  const data = load();
  const index = data.sessions.findIndex(
    (s) => s.nativeSessionID === record.nativeSessionID && s.agent === record.agent,
  );
  const entry = {
    ...(index >= 0 ? data.sessions[index] : {}),
    ...record,
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) data.sessions[index] = entry;
  else data.sessions.push(entry);
  save();
  return entry;
}

export function deleteSession(agent, nativeSessionID) {
  const data = load();
  const before = data.sessions.length;
  data.sessions = data.sessions.filter(
    (s) => !(s.agent === agent && s.nativeSessionID === nativeSessionID),
  );
  if (data.sessions.length !== before) save();
  return data.sessions.length !== before;
}
