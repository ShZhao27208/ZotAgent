import test from "node:test";
import assert from "node:assert/strict";
import { classifyRawEvent } from "../runtime/src/normalize.js";

test("classifies tool start events", () => {
  assert.equal(classifyRawEvent({ type: "tool.started" }), "tool.started");
  assert.equal(classifyRawEvent({ type: "command.start" }), "tool.started");
  assert.equal(classifyRawEvent({ type: "item.started" }), "tool.started");
  assert.equal(
    classifyRawEvent({ type: "assistant", message: { content: [{ type: "tool_use" }] } }),
    "tool.started",
  );
});

test("classifies tool completion events", () => {
  assert.equal(classifyRawEvent({ type: "tool.completed" }), "tool.completed");
  assert.equal(classifyRawEvent({ type: "command.complete" }), "tool.completed");
  assert.equal(classifyRawEvent({ type: "tool.result" }), "tool.completed");
});

test("classifies command output and start events", () => {
  assert.equal(classifyRawEvent({ type: "command.output" }), "command.output");
  assert.equal(classifyRawEvent({ type: "shell.output" }), "command.output");
  assert.equal(classifyRawEvent({ type: "command.start" }), "tool.started");
  assert.equal(classifyRawEvent({ type: "shell.start" }), "command.started");
  assert.equal(classifyRawEvent({ type: "exec.start" }), "command.started");
});

test("classifies file and artifact events", () => {
  assert.equal(classifyRawEvent({ type: "file.diff" }), "file.diff");
  assert.equal(classifyRawEvent({ type: "diff.file" }), "file.diff");
  assert.equal(classifyRawEvent({ type: "patch" }), "file.diff");
  assert.equal(classifyRawEvent({ type: "artifact.created" }), "artifact.created");
  assert.equal(classifyRawEvent({ type: "file.created" }), "artifact.created");
  assert.equal(classifyRawEvent({ type: "file.written" }), "artifact.created");
});

test("classifies usage and cost events", () => {
  assert.equal(classifyRawEvent({ type: "usage" }), "usage.updated");
  assert.equal(classifyRawEvent({ type: "cost" }), "usage.updated");
  assert.equal(classifyRawEvent({ type: "token.usage" }), "usage.updated");
});

test("classifies session lifecycle events", () => {
  assert.equal(classifyRawEvent({ type: "session.created" }), "session.created");
  assert.equal(classifyRawEvent({ type: "session.started" }), "session.created");
  assert.equal(classifyRawEvent({ type: "thread.created" }), "session.created");
  assert.equal(classifyRawEvent({ type: "session.resumed" }), "session.resumed");
  assert.equal(classifyRawEvent({ type: "thread.resumed" }), "session.resumed");
});

test("classifies message completion events", () => {
  assert.equal(classifyRawEvent({ type: "message.completed" }), "message.completed");
  assert.equal(classifyRawEvent({ type: "response.completed" }), "message.completed");
  assert.equal(classifyRawEvent({ type: "turn.end" }), "message.completed");
  assert.equal(classifyRawEvent({ type: "result" }), "message.completed");
});

test("classifies error events", () => {
  assert.equal(classifyRawEvent({ type: "error" }), "error");
  assert.equal(classifyRawEvent({ type: "agent.error" }), "error");
});

test("defaults unknown types to agent.event", () => {
  assert.equal(classifyRawEvent({ type: "something.unknown" }), "agent.event");
  assert.equal(classifyRawEvent({}), "agent.event");
  assert.equal(classifyRawEvent({ type: "" }), "agent.event");
});
