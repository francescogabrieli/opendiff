import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "node:http";
import { collectDiff } from "../cli/git.mjs";
import { createRequestHandler } from "../cli/server.mjs";
import { synthesizeReview } from "../cli/synthesize.mjs";
import { buildSharedHtml, DEFAULT_SHARE_FILENAME } from "../cli/share.mjs";

const cliFilePath = fileURLToPath(new URL("../cli/index.mjs", import.meta.url));
const shareTemplate = fileURLToPath(new URL("../dist-share/opendiff-share.html", import.meta.url));

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "opendiff-level0-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "opendiff-tests@example.com");
  git(root, "config", "user.name", "OpenDiff tests");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "value.ts"), "export const value = 1;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  writeFileSync(join(root, "src", "value.ts"), "export const value = 2;\nexport const added = true;\n");
  return root;
}

test("synthesizes a diff-only review from Git alone, with no recorded narrative", () => {
  const root = createRepository();
  const collected = collectDiff({ root, base: "HEAD", context: 3 });
  const document = synthesizeReview({ root, base: "HEAD", collected });

  assert.equal(document.mode, "diff-only");
  assert.equal(document.sections.length, 0);
  assert.equal(document.stats.filesChanged, 1);
  assert.equal(document.stats.additions, 2);
  // A diff-only document must never claim anything the diff does not prove.
  assert.deepEqual(document.tests.executed, []);
  assert.deepEqual(document.risks, []);
  assert.deepEqual(document.assumptions, []);
  assert.equal(document.git.baseRef, "HEAD");
});

test("the CLI opens a repository that has no review.json", () => {
  const root = createRepository();
  const result = spawnSync(process.execPath, [cliFilePath, "--no-open", "--port", "4699"], {
    cwd: root,
    encoding: "utf8",
    timeout: 20000,
    killSignal: "SIGKILL",
  });
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, /diff-only review/);
  assert.match(output, /1 diff files/);
  assert.doesNotMatch(output, /No OpenDiff review was found/);
});

test("share writes one self-contained file that excludes itself from the diff", () => {
  const root = createRepository();
  const run = () => spawnSync(process.execPath, [cliFilePath, "share", "--output", "review.html"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });

  const first = run();
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  const firstSize = readFileSync(join(root, "review.html")).byteLength;

  // Sharing twice must not embed the previous shared file into the new one.
  const second = run();
  assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
  const secondSize = readFileSync(join(root, "review.html")).byteLength;
  assert.equal(firstSize, secondSize);

  const html = readFileSync(join(root, "review.html"), "utf8");
  const payload = JSON.parse(html.match(/<script id="opendiff-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(payload.mode, "diff-only");
  assert.deepEqual(payload.diff.files.map((file) => file.path), ["src/value.ts"]);

  // A shared review has to open with no network at all.
  const external = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)];
  assert.deepEqual(external, []);
});

test("an embedded payload cannot break out of its script tag", () => {
  const html = buildSharedHtml({
    templatePath: shareTemplate,
    review: { review: { title: "</script><script>window.__pwned = true</script>" }, sections: [] },
    diff: { files: [] },
    mode: "diff-only",
  });
  assert.ok(!html.includes("</script><script>window.__pwned"));
  assert.ok(html.includes("\\u003c/script"));
});

test("share defaults to a stable filename that does not depend on the diff", () => {
  // A title-derived default would change as soon as the previous shared file
  // appeared in the working tree, which is exactly what share must ignore.
  assert.equal(DEFAULT_SHARE_FILENAME, "opendiff-review.html");
});

test("the local server serves a diff-only review when review.json is absent", async () => {
  const root = createRepository();
  const rendererRoot = fileURLToPath(new URL("../dist", import.meta.url));
  const server = createServer(createRequestHandler(root, rendererRoot));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  try {
    const review = await (await fetch(`http://127.0.0.1:${port}/__opendiff/data/review`)).json();
    assert.equal(review.mode, "diff-only");
    assert.equal(review.sections.length, 0);
    assert.equal(review.stats.filesChanged, 1);

    const diff = await (await fetch(`http://127.0.0.1:${port}/__opendiff/data/diff`)).json();
    assert.equal(diff.mode, "diff-only");
    assert.deepEqual(diff.files.map((file) => file.path), ["src/value.ts"]);

    // Staleness is meaningless without a recorded review, and must not be claimed.
    const status = await (await fetch(`http://127.0.0.1:${port}/__opendiff/status`)).json();
    assert.equal(status.mode, "diff-only");
    assert.equal(status.stale, false);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
