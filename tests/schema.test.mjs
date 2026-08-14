import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reviewDocumentSchema } from "../cli/schema.mjs";
import fixtureReview from "../examples/small-review/review.json" with { type: "json" };

test("the review schema documents the required guided-review fields", () => {
  const schema = JSON.parse(readFileSync(new URL("../schemas/review.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$id, "https://opendiff.local/schema/review-2.0.json");
  assert.deepEqual(schema.required, ["schemaVersion", "project", "review", "git", "stats", "sections", "tests", "risks", "assumptions", "completion"]);
  assert.ok(schema.$defs.section.required.includes("references"));
  assert.deepEqual(schema.$defs.risk.properties.severity.enum, ["low", "medium", "high"]);
  assert.equal(schema.$defs.executedTest.properties.status.enum.includes("passed"), true);
  assert.ok(schema.$defs.design.required.includes("acceptanceCriteria"));
});

test("the runtime schema accepts the portable example", () => {
  assert.equal(reviewDocumentSchema.safeParse(fixtureReview).success, true);
});

test("schema 2.0 requires design evidence for verified criteria", () => {
  const missingDesign = structuredClone(fixtureReview);
  delete missingDesign.design;
  assert.equal(reviewDocumentSchema.safeParse(missingDesign).success, false);

  const missingEvidence = structuredClone(fixtureReview);
  missingEvidence.design.acceptanceCriteria[0].evidence = [];
  assert.equal(reviewDocumentSchema.safeParse(missingEvidence).success, false);

  const unknownSupport = structuredClone(fixtureReview);
  unknownSupport.tests.executed[0].supports = ["criterion-does-not-exist"];
  assert.equal(reviewDocumentSchema.safeParse(unknownSupport).success, false);
});

test("schema 1.0 reviews remain compatible", () => {
  const legacy = structuredClone(fixtureReview);
  legacy.schemaVersion = "1.0";
  delete legacy.design;
  legacy.tests.executed.forEach((executed) => delete executed.supports);
  assert.equal(reviewDocumentSchema.safeParse(legacy).success, true);
});

test("the runtime schema rejects unstructured risks and test results", () => {
  const unstructuredRisk = structuredClone(fixtureReview);
  unstructuredRisk.risks = ["Something may fail"];
  assert.equal(reviewDocumentSchema.safeParse(unstructuredRisk).success, false);

  const unstructuredTest = structuredClone(fixtureReview);
  unstructuredTest.tests.executed = ["npm test"];
  assert.equal(reviewDocumentSchema.safeParse(unstructuredTest).success, false);
});
