import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const cli = join(repositoryRoot, "cli", "opendiffs.mjs");

function run(args, env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("installs and removes the OpenDiffs skill for Codex and Claude Code", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "opendiffs-installer-"));
  const codexHome = join(sandbox, "codex");
  const claudeHome = join(sandbox, "claude");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(claudeHome, { recursive: true });

  const env = {
    CODEX_HOME: codexHome,
    CLAUDE_CONFIG_DIR: claudeHome,
  };

  try {
    const installed = run(["install", "--agent", "all"], env);
    assert.equal(installed.status, 0, installed.stderr);
    assert.match(installed.stdout, /Codex: installed @opendiffs/);
    assert.match(installed.stdout, /Claude Code: installed @opendiffs/);

    const codexSkill = join(codexHome, "skills", "opendiffs", "SKILL.md");
    const claudeSkill = join(claudeHome, "skills", "opendiffs", "SKILL.md");
    assert.equal(existsSync(codexSkill), true);
    assert.equal(existsSync(claudeSkill), true);
    assert.match(readFileSync(codexSkill, "utf8"), /name: opendiffs/);
    assert.equal(readFileSync(codexSkill, "utf8"), readFileSync(claudeSkill, "utf8"));

    const repeated = run(["install", "--agent", "all"], env);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /skill already current/);

    const removed = run(["uninstall", "--agent", "all"], env);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(existsSync(join(codexHome, "skills", "opendiffs")), false);
    assert.equal(existsSync(join(claudeHome, "skills", "opendiffs")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("auto detection reports a useful error when no agent has been initialized", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "opendiffs-installer-empty-"));

  try {
    const result = run(["install"], {
      CODEX_HOME: join(sandbox, "missing-codex"),
      CLAUDE_CONFIG_DIR: join(sandbox, "missing-claude"),
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Neither Codex nor Claude Code was detected/);
    assert.match(result.stderr, /--agent codex/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
