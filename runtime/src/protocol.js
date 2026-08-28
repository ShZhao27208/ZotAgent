import { timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export function isAuthorized(request, expectedToken) {
  const header = request.headers.authorization || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = Buffer.from(provided);
  const right = Buffer.from(expectedToken);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function readJSON(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds 4 MiB");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export function writeJSON(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  response.end(JSON.stringify(body));
}

export function startNDJSON(response) {
  response.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*",
  });
}

export function writeEvent(response, event) {
  if (!response.destroyed && !response.writableEnded) {
    response.write(JSON.stringify(event) + "\n");
  }
}

export function envelope(request, type, data = {}) {
  return {
    type,
    timestamp: Date.now(),
    windowID: request.windowID,
    requestID: request.requestID,
    agent: request.agent,
    nativeSessionID: data.nativeSessionID || request.nativeSessionID || null,
    data,
  };
}
