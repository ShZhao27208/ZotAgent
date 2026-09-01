import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../plugin/content/zot-agent.js", import.meta.url), "utf8");

test("PDF selection uses the Zotero popup event and all reader views", () => {
  assert.match(source, /registerEventListener\(\s*"renderTextSelectionPopup"/);
  assert.match(source, /unregisterEventListener\("renderTextSelectionPopup"/);
  assert.match(source, /event\?\.doc/);
  assert.match(source, /_primaryView\?\._iframeWindow\?\.document/);
  assert.match(source, /_secondaryView\?\._iframeWindow\?\.document/);
});

test("insert cursor supports PDF annotation popup editors", () => {
  assert.match(source, /insertIntoReaderCursor\(reader, markdown\)/);
  assert.match(source, /\.annotation-popup \[contenteditable='true'\]/);
  assert.match(source, /range\.createContextualFragment\(markdownToNoteHTML\(markdown\)\)/);
  assert.match(source, /target\.selectionStart/);
});

test("long capture keeps native scrolling and waits for confirmation", () => {
  const start = source.indexOf("    _captureLongSlices(");
  const end = source.indexOf("    _captureViewportRegion(", start);
  assert.ok(start >= 0 && end > start);
  const implementation = source.slice(start, end);
  assert.doesNotMatch(implementation, /const onWheel/);
  assert.doesNotMatch(implementation, /setTimeout\(\(\)\s*=>\s*finish/);
  assert.match(implementation, /addEventListener\("scroll", scheduleCapture, \{ passive: true \}\)/);
  assert.match(implementation, /addEventListener\("wheel", scheduleCapture, \{ capture: true, passive: true \}\)/);
  assert.match(implementation, /return \{ finish, dispose \}/);
});

test("long capture appends only the newly revealed scroll distance", () => {
  assert.match(source, /const delta = slices\[index\]\.top - slices\[index - 1\]\.top/);
  assert.match(source, /sourceY: images\[index\]\.height - newHeight/);
});
