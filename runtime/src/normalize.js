function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.length);
}

export function extractError(raw) {
  const error = raw?.error || raw?.properties?.error;
  const data = error?.data;
  const detail = firstString(data?.message, error?.message, typeof error === "string" ? error : null,
    raw?.message, Array.isArray(raw?.errors) ? raw.errors.join("\n") : null, raw?.is_error ? raw?.result : null);
  const model = data?.providerID && data?.modelID ? `${data.providerID}/${data.modelID}` : null;
  return [error?.name, detail, model && `模型：${model}`].filter(Boolean).join(" · ") || "Agent 返回错误（未提供详细原因）";
}

export function extractModel(raw) {
  if (!raw || typeof raw !== "object") return null;
  return firstString(
    raw.model,
    raw.model_id,
    raw.modelID,
    raw.data?.model,
    raw.data?.model_id,
    raw.data?.modelID,
    raw.response?.model,
    raw.message?.model,
    raw.info?.model,
    raw.part?.model,
    raw.part?.modelID,
    raw.part?.model_id,
    raw.properties?.model,
    raw.properties?.modelID,
    raw.properties?.model_id,
  ) || null;
}

export function extractSessionID(raw) {
  if (!raw || typeof raw !== "object") return null;
  return firstString(
    raw.session_id,
    raw.sessionID,
    raw.thread_id,
    raw.threadID,
    raw.session?.id,
    raw.data?.session_id,
    raw.data?.sessionID,
    raw.data?.thread_id,
    /session|thread/i.test(raw.type || "") ? raw.id : null,
  );
}

export function extractText(raw) {
  if (!raw || typeof raw !== "object") return null;
  // Claude Code stream-json: {type:"assistant", message:{content:[{text:"..."}]}}
  if (raw.type === "assistant" && raw.message?.content) {
    const text = raw.message.content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
    if (text) return text;
  }
  // Claude Code stream-json: {type:"content_block_delta", delta:{text:"..."}}
  if (raw.type === "content_block_delta") {
    return firstString(raw.delta?.text);
  }
  // OpenCode: {type:"stream_event", event:{delta:{text:"..."}}}
  if (raw.type === "stream_event") {
    return firstString(raw.event?.delta?.text);
  }
  // Codex: {type:"item.completed", item:{type:"agent_message", text:"..."}}
  if (raw.type === "item.completed" && raw.item?.type === "agent_message") {
    return firstString(raw.item.text);
  }
  // OpenCode part events
  if (raw.part?.type === "text") return firstString(raw.part.text);
  // Generic delta patterns
  if (/text.*delta|message\.delta/i.test(raw.type || "")) {
    return firstString(raw.text, raw.delta?.text, raw.data?.text);
  }
  return null;
}

export function classifyRawEvent(raw) {
  if (raw?.is_error || raw?.type === "turn.failed") return "error";
  const type = String(raw?.type || "agent.event");

  // Approval/permission
  if (/approval.*resolve|permission.*grant|permission.*deny/i.test(type)) return "approval.resolved";
  if (/approval|permission/i.test(type)) return "approval.requested";

  // Tool/command events
  if (type === "assistant" && raw.message?.content?.some((b) => b.type === "tool_use")) return "tool.started";
  if (/tool.*start|command.*start|item\.started/i.test(type)) return "tool.started";
  if (/tool.*complete|command.*complete|tool.*result/i.test(type)) return "tool.completed";
  if (/command\.output|shell\.output|exec\.output/i.test(type)) return "command.output";
  if (/command\.start|shell\.start|exec\.start/i.test(type)) return "command.started";

  // File and artifact events
  if (/file.*diff|diff.*file|patch/i.test(type)) return "file.diff";
  if (/artifact|file.*creat|file.*writ/i.test(type)) return "artifact.created";

  // Usage/cost events
  if (/usage|cost|token/i.test(type)) return "usage.updated";

  // Session events
  if (/session.*creat|session.*start|thread.*creat/i.test(type)) return "session.created";
  if (/session.*resum|thread.*resum/i.test(type)) return "session.resumed";

  // Message completion
  if (/message.*complet|response.*complet|turn.*end/i.test(type)) return "message.completed";
  if (type === "result") return "message.completed";

  // Error
  if (/^error$|\.error$/i.test(type)) return "error";

  return "agent.event";
}

// Claude may emit streamed text followed by a complete assistant message.
// Keep all visible blocks while avoiding a second copy of the streamed prefix.
export function createTextExtractor(agent) {
  let streamed = "";
  const completed = new Set();
  return (raw) => {
    if (agent !== "claude-code") return extractText(raw);
    const event = raw?.type === "stream_event" ? raw.event : raw;
    if (event?.type === "message_start") streamed = "";
    const text = extractText(raw);
    if (raw?.type === "assistant") {
      const id = raw.uuid || (raw.message?.id ? raw.message.id + ":" + JSON.stringify(raw.message.content) : null);
      if (id && completed.has(id)) return null;
      if (id) completed.add(id);
      const remainder = text && streamed && text.startsWith(streamed) ? text.slice(streamed.length) : text;
      streamed = "";
      return remainder || null;
    }
    if (text && event?.type === "content_block_delta") streamed += text;
    return text || null;
  };
}

export function parseAgentLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return { type: "process.output", text: line };
  }
}
