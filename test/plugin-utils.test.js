import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../plugin/content/zot-agent.js", import.meta.url),
  "utf8",
);

// Extract self-contained utility functions from the IIFE source
function extractFunction(name) {
  const pattern = new RegExp(
    `(  function ${name}\\b[^]*?)\\n  function `,
  );
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not extract function: ${name}`);
  return match[1].trim();
}

// Build an isolated evaluation context with the three utility functions
const escapeHTMLSrc = extractFunction("escapeHTML");
const markdownSrc = extractFunction("markdownToNoteHTML");
const wslPathSrc = extractFunction("windowsToWSLPath");
const rootURISrc = extractFunction("rootURIToWSLPath");

const mod = new Function(`
  ${escapeHTMLSrc}
  ${markdownSrc}
  ${wslPathSrc}
  ${rootURISrc}
  return { escapeHTML, markdownToNoteHTML, windowsToWSLPath, rootURIToWSLPath };
`)();

const { escapeHTML, markdownToNoteHTML, windowsToWSLPath, rootURIToWSLPath } = mod;

// ─── escapeHTML ──────────────────────────────────────

test("escapeHTML escapes ampersands", () => {
  assert.equal(escapeHTML("a & b"), "a &amp; b");
});

test("escapeHTML escapes angle brackets", () => {
  assert.equal(escapeHTML("<div>"), "&lt;div&gt;");
});

test("escapeHTML escapes quotes", () => {
  assert.equal(escapeHTML(`"it's"`), "&quot;it&#39;s&quot;");
});

test("escapeHTML coerces non-string input", () => {
  assert.equal(escapeHTML(42), "42");
  assert.equal(escapeHTML(null), "null");
});

// ─── windowsToWSLPath ────────────────────────────────

test("windowsToWSLPath converts a drive letter path", () => {
  assert.equal(windowsToWSLPath("C:\\Users\\test"), "/mnt/c/Users/test");
});

test("windowsToWSLPath converts uppercase drive letter", () => {
  assert.equal(windowsToWSLPath("D:\\Data\\file.txt"), "/mnt/d/Data/file.txt");
});

test("windowsToWSLPath passes through non-Windows paths", () => {
  assert.equal(windowsToWSLPath("/home/user"), "/home/user");
});

test("windowsToWSLPath returns empty string for falsy input", () => {
  assert.equal(windowsToWSLPath(""), "");
  assert.equal(windowsToWSLPath(null), "");
  assert.equal(windowsToWSLPath(undefined), "");
});

// ─── markdownToNoteHTML ──────────────────────────────

test("markdownToNoteHTML converts headings", () => {
  assert.match(markdownToNoteHTML("# Title"), /^<h1>Title<\/h1>$/);
  assert.match(markdownToNoteHTML("## Sub"), /^<h2>Sub<\/h2>$/);
  assert.match(markdownToNoteHTML("###### Deep"), /^<h6>Deep<\/h6>$/);
});

test("markdownToNoteHTML converts bold and italic", () => {
  const html = markdownToNoteHTML("**bold** and *italic*");
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
});

test("markdownToNoteHTML converts inline code", () => {
  assert.match(markdownToNoteHTML("use `npm test`"), /<code>npm test<\/code>/);
});

test("markdownToNoteHTML converts code blocks", () => {
  const md = "```\nconst x = 1;\n```";
  const html = markdownToNoteHTML(md);
  assert.match(html, /<pre><code>/);
  assert.match(html, /const x = 1;/);
});

test("markdownToNoteHTML converts unordered lists", () => {
  const md = "- item 1\n- item 2";
  const html = markdownToNoteHTML(md);
  assert.match(html, /<ul>/);
  assert.match(html, /<li>item 1<\/li>/);
  assert.match(html, /<li>item 2<\/li>/);
});

test("markdownToNoteHTML converts ordered lists", () => {
  const md = "1. first\n2. second";
  const html = markdownToNoteHTML(md);
  assert.match(html, /<ol>/);
  assert.match(html, /<li>first<\/li>/);
});

test("markdownToNoteHTML converts blockquotes", () => {
  assert.match(markdownToNoteHTML("> quoted"), /<blockquote><p>quoted<\/p><\/blockquote>/);
});

test("markdownToNoteHTML converts horizontal rules", () => {
  assert.match(markdownToNoteHTML("---"), /<hr\/>/);
});

test("markdownToNoteHTML converts tables", () => {
  const md = "| A | B |\n|---|---|\n| 1 | 2 |";
  const html = markdownToNoteHTML(md);
  assert.match(html, /<table>/);
  assert.match(html, /<th>A<\/th>/);
  assert.match(html, /<td>1<\/td>/);
});

test("markdownToNoteHTML converts links", () => {
  const html = markdownToNoteHTML("[text](https://example.com)");
  assert.match(html, /<a href="https:\/\/example\.com">text<\/a>/);
});

test("markdownToNoteHTML sanitizes javascript: links", () => {
  const html = markdownToNoteHTML("[click](javascript:alert(1))");
  assert.doesNotMatch(html, /href="javascript/);
});

test("markdownToNoteHTML converts strikethrough", () => {
  assert.match(markdownToNoteHTML("~~deleted~~"), /<del>deleted<\/del>/);
});

test("markdownToNoteHTML handles empty input", () => {
  assert.equal(markdownToNoteHTML(""), "");
});

// ─── rootURIToWSLPath ───────────────────────────────

test("rootURIToWSLPath converts Windows drive URI", () => {
  assert.equal(rootURIToWSLPath("file:///C:/Users/test/ZotAgent/plugin/"), "/mnt/c/Users/test/ZotAgent/plugin");
});

test("rootURIToWSLPath converts wsl.localhost URI", () => {
  assert.equal(rootURIToWSLPath("file:///wsl.localhost/Ubuntu/home/user/ZotAgent/plugin/"), "/home/user/ZotAgent/plugin");
});

test("rootURIToWSLPath converts wsl$ URI", () => {
  assert.equal(rootURIToWSLPath("file:///wsl$/Ubuntu/home/user/ZotAgent/plugin/"), "/home/user/ZotAgent/plugin");
});

test("rootURIToWSLPath passes through Unix paths", () => {
  assert.equal(rootURIToWSLPath("file:///home/user/ZotAgent/plugin/"), "/home/user/ZotAgent/plugin");
});

test("rootURIToWSLPath returns empty string for falsy input", () => {
  assert.equal(rootURIToWSLPath(""), "");
  assert.equal(rootURIToWSLPath(null), "");
  assert.equal(rootURIToWSLPath(undefined), "");
});
