import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reviewDocumentSchema } from "../cli/schema.mjs";
import fixtureReview from "../examples/small-review/review.json" with { type: "json" };

test("the review schema documents the required guided-review fields", () => {
  const schema = JSON.parse(readFileSync(new URL("../schemas/review.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$id, "https://opendiff.local/schema/review-1.0.json");
  assert.deepEqual(schema.required, ["schemaVersion", "project", "review", "git", "stats", "sections", "tests", "risks", "assumptions", "completion"]);
  assert.ok(schema.$defs.section.required.includes("references"));
  assert.deepEqual(schema.$defs.risk.properties.severity.enum, ["low", "medium", "high"]);
  assert.equal(schema.$defs.executedTest.properties.status.enum.includes("passed"), true);
});

test("the runtime schema accepts the portable example", () => {
  assert.equal(reviewDocumentSchema.safeParse(fixtureReview).success, true);
});

test("the runtime schema rejects unstructured risks and test results", () => {
  const unstructuredRisk = structuredClone(fixtureReview);
  unstructuredRisk.risks = ["Something may fail"];
  assert.equal(reviewDocumentSchema.safeParse(unstructuredRisk).success, false);

  const unstructuredTest = structuredClone(fixtureReview);
  unstructuredTest.tests.executed = ["npm test"];
  assert.equal(reviewDocumentSchema.safeParse(unstructuredTest).success, false);
});
