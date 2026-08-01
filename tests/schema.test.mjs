import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the review schema documents the required guided-review fields", () => {
  const schema = JSON.parse(readFileSync(new URL("../schemas/review.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$id, "https://opendiff.local/schema/review-1.0.json");
  assert.deepEqual(schema.required, ["schemaVersion", "project", "review", "git", "stats", "sections", "tests", "risks", "assumptions", "completion"]);
  assert.ok(schema.$defs.section.required.includes("references"));
});
