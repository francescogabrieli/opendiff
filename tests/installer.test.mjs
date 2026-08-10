import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const cli = join(repositoryRoot, "cli", "opendiff.mjs");

function run(args, env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("installs and removes the OpenDiff skill for Codex and Claude Code", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "opendiff-installer-"));
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
    assert.match(installed.stdout, /Codex: installed @opendiff/);
    assert.match(installed.stdout, /Claude Code: installed @opendiff/);

    const codexSkill = join(codexHome, "skills", "opendiff", "SKILL.md");
    const claudeSkill = join(claudeHome, "skills", "opendiff", "SKILL.md");
    assert.equal(existsSync(codexSkill), true);
    assert.equal(existsSync(claudeSkill), true);

    const installedSkill = readFileSync(codexSkill, "utf8");
    assert.match(installedSkill, /name: opendiff/);
    assert.match(installedSkill, /same natural language as the user's original task/);
    assert.match(installedSkill, /technically competent reader who is new to the repository/);
    assert.match(installedSkill, /references` are evidence for the narrative, not a substitute for it/);
    assert.equal(installedSkill, readFileSync(claudeSkill, "utf8"));

    const repeated = run(["install", "--agent", "all"], env);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /skill already current/);

    const removed = run(["uninstall", "--agent", "all"], env);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(existsSync(join(codexHome, "skills", "opendiff")), false);
    assert.equal(existsSync(join(claudeHome, "skills", "opendiff")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("auto detection reports a useful error when no agent has been initialized", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "opendiff-installer-empty-"));

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
