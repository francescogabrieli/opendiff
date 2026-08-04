import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { createStaticHandler } from "../cli/server.mjs";

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
  const root = mkdtempSync(join(tmpdir(), "opendiffs-server-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>OpenDiffs</title>");
  writeFileSync(join(root, "assets", "app.js"), "console.log('OpenDiffs');");
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
  assert.match(page.body, /OpenDiffs/);
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
