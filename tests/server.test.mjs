import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { createHandler, createStaticHandler } from "../cli/server.mjs";

class MockResponse extends Writable {
  statusCode = 200;
  headers = new Map();
  chunks = [];

  setHeader(name, value) {
    this.headers.set(name.toLowerCase(), String(value));
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  get body() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function createRenderer() {
  const root = mkdtempSync(join(tmpdir(), "opendiff-server-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>OpenDiff</title>");
  writeFileSync(join(root, "assets", "app.js"), "console.log('OpenDiff');");
  return createStaticHandler(root);
}

function request(handler, method, url) {
  return new Promise((resolve) => {
    const response = new MockResponse();
    response.once("finish", () => resolve(response));
    handler({ method, url }, response);
  });
}

test("serves the bundled renderer and its immutable assets", async () => {
  const handler = createRenderer();
  const page = await request(handler, "GET", "/review/section");
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /OpenDiff/);
  assert.equal(page.headers.get("cache-control"), "no-cache");

  const asset = await request(handler, "GET", "/assets/app.js");
  assert.equal(asset.statusCode, 200);
  assert.match(asset.headers.get("content-type"), /text\/javascript/);
  assert.match(asset.headers.get("cache-control"), /immutable/);
});

test("rejects unsupported methods", async () => {
  const response = await request(createRenderer(), "POST", "/");
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("does not serve files outside the renderer root", async () => {
  const response = await request(createRenderer(), "GET", "/%2e%2e%2fsecret.txt");
  assert.equal(response.statusCode, 403);
});

function createRepositoryWithReview(fingerprint) {
  const root = mkdtempSync(join(tmpdir(), "opendiff-data-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "opendiff-tests@example.com");
  git("config", "user.name", "OpenDiff tests");
  writeFileSync(join(root, "file.ts"), "export const value = 1;\n");
  git("add", ".");
  git("commit", "-qm", "base");
  writeFileSync(join(root, "file.ts"), "export const value = 2;\n");
  mkdirSync(join(root, ".opendiff"));
  writeFileSync(join(root, ".opendiff", "review.json"), JSON.stringify({
    git: { baseRef: "HEAD", fingerprint, includeStaged: true, includeUnstaged: true, includeUntracked: true },
  }));
  return root;
}

test("the diff endpoint reports staleness from the fingerprint it computed", async () => {
  const handler = createHandler(createRepositoryWithReview("recorded-fingerprint"));
  const response = await request(handler, "GET", "/__opendiff/data/diff?context=5");
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.files.length, 1);
  assert.equal(body.files[0].path, "file.ts");
  assert.equal(body.files[0].oldSize, Buffer.byteLength("export const value = 1;\n"));
  assert.equal(body.recordedFingerprint, "recorded-fingerprint");
  assert.equal(body.stale, true);
  assert.equal(typeof body.fingerprint, "string");
});

test("the diff endpoint is not stale without a recorded fingerprint", async () => {
  const handler = createHandler(createRepositoryWithReview(""));
  const response = await request(handler, "GET", "/__opendiff/data/diff?context=5");
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.recordedFingerprint, null);
  assert.equal(body.stale, false);
});
