#!/usr/bin/env node
// Verifies locally everything the publish workflow verifies remotely, so a
// release never fails after the tag is already pushed.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const tag = `v${version}`;
const failures = [];

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    if (allowFailure) return "";
    throw new Error(error?.stderr?.toString().trim() || error.message);
  }
}

function check(label, run) {
  try {
    const problem = run();
    if (problem) {
      failures.push({ label, problem });
      console.log(`× ${label}`);
      console.log(`  ${problem}`);
    } else {
      console.log(`✓ ${label}`);
    }
  } catch (error) {
    failures.push({ label, problem: error.message });
    console.log(`× ${label}`);
    console.log(`  ${error.message}`);
  }
}

console.log(`OpenDiff release preflight — ${tag}\n`);

check("Working tree is clean", () =>
  git(["status", "--porcelain"]) ? "Commit or stash your changes before tagging a release." : "");

check("The release commit is on origin/main", () => {
  git(["fetch", "--no-tags", "origin", "main"], { allowFailure: true });
  const head = git(["rev-parse", "HEAD"]);
  const originMain = git(["rev-parse", "origin/main"], { allowFailure: true });
  if (!originMain) return "origin/main could not be resolved. Check the 'origin' remote.";
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", head, originMain], { stdio: "ignore" });
    return "";
  } catch {
    return [
      `HEAD (${head.slice(0, 8)}) is not an ancestor of origin/main (${originMain.slice(0, 8)}).`,
      "The publish workflow refuses to release a commit that never reached main.",
      "Merge this branch into main and push it before tagging.",
    ].join("\n  ");
  }
});

check(`Tag ${tag} does not already exist`, () => {
  const local = git(["tag", "--list", tag]);
  if (local) return `${tag} already exists locally. Delete it or bump the version in package.json.`;
  const remote = git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`], { allowFailure: true });
  return remote ? `${tag} already exists on origin. Bump the version in package.json.` : "";
});

check(`CHANGELOG.md documents ${version}`, () => {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^## \\[${escaped}\\](?: - .+)?$`, "m").exec(changelog);
  if (!match) return `CHANGELOG.md has no "## [${version}]" section.`;
  const remainder = changelog.slice(match.index + match[0].length);
  const nextHeader = remainder.search(/^## /m);
  const notes = (nextHeader === -1 ? remainder : remainder.slice(0, nextHeader)).trim();
  return notes ? "" : `The CHANGELOG.md section for ${version} is empty.`;
});

console.log("");
if (failures.length) {
  console.error(`Preflight failed: ${failures.length} problem(s) would stop the publish workflow.`);
  console.error("Fix them before running: git tag " + tag + " && git push origin " + tag);
  process.exitCode = 1;
} else {
  console.log("Preflight passed. Release with:");
  console.log(`  git tag ${tag} && git push origin ${tag}`);
}
