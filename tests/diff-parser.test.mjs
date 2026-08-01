import assert from "node:assert/strict";
import test from "node:test";
import { parseDiff } from "../cli/diff.mjs";

test("parses a modified file and preserves line numbers", () => {
  const files = parseDiff(`diff --git a/src/example.ts b/src/example.ts\nindex 1..2 100644\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -2,2 +2,3 @@ export function example()\n const before = true;\n-old line\n+new line\n+second line\n`);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "src/example.ts");
  assert.equal(files[0].additions, 2);
  assert.equal(files[0].deletions, 1);
  assert.deepEqual(files[0].lines.filter((line) => line.type !== "hunk" && line.newLine !== undefined).map((line) => line.newLine), [2, 3, 4]);
});

test("detects added, deleted, and renamed files", () => {
  const files = parseDiff([
    "diff --git a/new.ts b/new.ts",
    "new file mode 100644",
    "@@ -0,0 +1 @@",
    "+export const newFile = true;",
    "diff --git a/old.ts b/old.ts",
    "deleted file mode 100644",
    "@@ -1 +0,0 @@",
    "-export const oldFile = true;",
    "diff --git a/old-name.ts b/new-name.ts",
    "similarity index 100%",
    "rename from old-name.ts",
    "rename to new-name.ts",
  ].join("\n"));
  assert.equal(files[0].status, "added");
  assert.equal(files[1].status, "deleted");
  assert.equal(files[2].status, "renamed");
  assert.equal(files[2].previousPath, "old-name.ts");
  assert.equal(files[2].path, "new-name.ts");
});

test("represents binary changes without inventing text lines", () => {
  const files = parseDiff([
    "diff --git a/assets/icon.png b/assets/icon.png",
    "index 123..456 100644",
    "Binary files a/assets/icon.png and b/assets/icon.png differ",
  ].join("\n"));
  assert.equal(files[0].status, "binary");
  assert.equal(files[0].lines[0].type, "binary");
});
