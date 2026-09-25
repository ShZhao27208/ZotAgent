import test from "node:test";
import assert from "node:assert/strict";
import { classifyRawEvent, extractError, extractModel, extractSessionID, extractText, parseAgentLine } from "../runtime/src/normalize.js";

test("extracts model identifiers from native event shapes", () => {
  assert.equal(extractModel({ type: "session.started", model: "provider/model" }), "provider/model");
  assert.equal(extractModel({ data: { model_id: "gpt-test" } }), "gpt-test");
  assert.equal(extractModel({ type: "message.completed" }), null);
});

test("extracts session identifiers from all adapter shapes", () => {
  assert.equal(extractSessionID({ type: "thread.started", thread_id: "c1" }), "c1");
  assert.equal(extractSessionID({ type: "system", session_id: "a1" }), "a1");
  assert.equal(extractSessionID({ type: "step_start", sessionID: "o1" }), "o1");
});

test("extracts streamed and completed assistant text", () => {
  assert.equal(extractText({ type: "stream_event", event: { delta: { text: "hello" } } }), "hello");
  assert.equal(extractText({ type: "item.completed", item: { type: "agent_message", text: "done" } }), "done");
  assert.equal(extractText({ type: "part", part: { type: "text", text: "open" } }), "open");
});

test("extracts text from Claude Code stream-json events", () => {
  assert.equal(extractText({
    type: "assistant",
    message: { content: [{ type: "text", text: "hi there" }] },
  }), "hi there");
  assert.equal(extractText({
    type: "content_block_delta",
    delta: { text: "chunk" },
  }), "chunk");
  assert.equal(extractText({ type: "result", result: "final" }), null);
});

test("keeps non-JSON process output", () => {
  assert.deepEqual(parseAgentLine("plain output"), { type: "process.output", text: "plain output" });
});

test("distinguishes approval requests from resolutions", () => {
  assert.equal(classifyRawEvent({ type: "approval.requested" }), "approval.requested");
  assert.equal(classifyRawEvent({ type: "approval.resolved" }), "approval.resolved");
  assert.equal(classifyRawEvent({ type: "permission.grant" }), "approval.resolved");
  assert.equal(classifyRawEvent({ type: "permission.deny" }), "approval.resolved");
});

test('Claude preserves all visible blocks and excludes thinking and tool output',()=>{
  assert.equal(extractText({type:'assistant',message:{content:[{type:'text',text:'first'},{type:'thinking',text:'hidden'},{type:'tool_use',text:'tool'},{type:'text',text:'last'}]}}),'firstlast');
});
test('Claude streamed blocks followed by a snapshot are not duplicated',async()=>{
  const {createTextExtractor}=await import('../runtime/src/normalize.js');const extract=createTextExtractor('claude-code');
  assert.equal(extract({type:'stream_event',event:{type:'message_start'}}),null);
  assert.equal(extract({type:'stream_event',event:{type:'content_block_delta',delta:{text:'first'}}}),'first');
  const final={type:'assistant',message:{id:'m',content:[{type:'text',text:'first'},{type:'text',text:'last'}]}};
  assert.equal(extract(final),'last');assert.equal(extract(final),null);
  assert.equal(classifyRawEvent({type:'result',is_error:true}),'error');
});

test('OpenCode nested provider failures and unavailable model IDs remain actionable',()=>{
  assert.equal(extractError({type:'error',error:{name:'APIError',data:{message:'Provider quota exceeded'}}}),'APIError · Provider quota exceeded');
  assert.equal(extractError({type:'error',error:{name:'ProviderModelNotFoundError',data:{providerID:'opencode',modelID:'missing'}}}),'ProviderModelNotFoundError · 模型：opencode/missing');
  assert.equal(extractError({type:'result',is_error:true,errors:['failed one','failed two']}),'failed one\nfailed two');
  assert.equal(extractError({type:'turn.failed',error:{message:'context full'}}),'context full');
});
