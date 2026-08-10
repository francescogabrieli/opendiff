#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const skillSource = join(packageRoot, "skills", "opendiff", "SKILL.md");

const agents = {
  codex: {
    label: "Codex",
    home: process.env.CODEX_HOME || join(homedir(), ".codex"),
  },
  claude: {
    label: "Claude Code",
    home: process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
  },
};

for (const agent of Object.values(agents)) {
  agent.skillsDirectory = join(agent.home, "skills");
  agent.destination = join(agent.skillsDirectory, "opendiff", "SKILL.md");
}

function printHelp() {
  console.log(`OpenDiff — guided reviews for coding agents

Usage:
  opendiff install [--agent codex|claude|all] [--force]
  opendiff uninstall [--agent codex|claude|all]
  opendiff doctor
  opendiff review [options]

Recommended first run:
  npx --yes opendiff@latest install

After installation, invoke @opendiff from Codex or Claude Code.

Installer options:
  --agent NAME  Install for one agent, or all detected agents
  --force       Replace an existing skill even when it is already current
  --help        Show this help

The review, validate, render, open, and export commands are forwarded to the
OpenDiff runtime. `);
}

function parseInstallerOptions(argv) {
  const options = { agent: "auto", force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") options.force = true;
    else if (argument === "--agent") {
      const value = argv[index + 1];
      if (!value) throw new Error("--agent requires codex, claude, or all.");
      options.agent = value;
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown installer option “${argument}”.`);
    }
  }

  if (!["auto", "codex", "claude", "all"].includes(options.agent)) {
    throw new Error("--agent must be codex, claude, or all.");
  }

  return options;
}

function detectedAgentKeys() {
  return Object.entries(agents)
    .filter(([, agent]) => existsSync(agent.home))
    .map(([key]) => key);
}

function selectedAgentKeys(selection) {
  if (selection === "codex" || selection === "claude") return [selection];
  if (selection === "all") return Object.keys(agents);
  return detectedAgentKeys();
}

function ensureSkillSource() {
  if (!existsSync(skillSource)) {
    throw new Error(`The bundled OpenDiff skill is missing at ${skillSource}.`);
  }
}

function filesMatch(first, second) {
  if (!existsSync(first) || !existsSync(second)) return false;
  return readFileSync(first, "utf8") === readFileSync(second, "utf8");
}

function installSkill(argv) {
  ensureSkillSource();
  const options = parseInstallerOptions(argv);
  const keys = selectedAgentKeys(options.agent);

  console.log("OpenDiff installer\n");

  if (!keys.length) {
    throw new Error(
      "Neither Codex nor Claude Code was detected. Start the agent once, or rerun with --agent codex, --agent claude, or --agent all.",
    );
  }

  for (const key of keys) {
    const agent = agents[key];
    const alreadyCurrent = filesMatch(skillSource, agent.destination);

    if (alreadyCurrent && !options.force) {
      console.log(`✓ ${agent.label}: skill already current`);
      console.log(`  ${agent.destination}`);
      continue;
    }

    mkdirSync(dirname(agent.destination), { recursive: true });
    copyFileSync(skillSource, agent.destination);
    console.log(`✓ ${agent.label}: installed @opendiff`);
    console.log(`  ${agent.destination}`);
  }

  console.log("\nOpenDiff is ready. Restart the coding agent if it was already open, then invoke @opendiff from chat.");
}

function uninstallSkill(argv) {
  const options = parseInstallerOptions(argv);
  const keys = selectedAgentKeys(options.agent === "auto" ? "all" : options.agent);
  let removed = 0;

  console.log("OpenDiff uninstaller\n");

  for (const key of keys) {
    const agent = agents[key];
    const skillDirectory = dirname(agent.destination);
    if (!existsSync(skillDirectory)) {
      console.log(`– ${agent.label}: no installed skill found`);
      continue;
    }
    rmSync(skillDirectory, { recursive: true, force: true });
    removed += 1;
    console.log(`✓ ${agent.label}: removed ${skillDirectory}`);
  }

  if (!removed) console.log("\nNothing was removed.");
}

function commandAvailable(command, args = ["--version"]) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function doctor() {
  ensureSkillSource();
  const checks = [
    ["Node.js 20.19+", (() => {
      const [major, minor] = process.versions.node.split(".").map(Number);
      return major > 20 || (major === 20 && minor >= 19);
    })()],
    ["Git", commandAvailable("git")],
    ["Bundled renderer", existsSync(join(packageRoot, "dist", "index.html"))],
    ["Codex detected", existsSync(agents.codex.home)],
    ["Codex skill installed", existsSync(agents.codex.destination)],
    ["Claude Code detected", existsSync(agents.claude.home)],
    ["Claude Code skill installed", existsSync(agents.claude.destination)],
  ];

  console.log("OpenDiff doctor\n");
  for (const [label, passed] of checks) {
    console.log(`${passed ? "✓" : "×"} ${label}`);
  }

  const blocking = checks.slice(0, 3).some(([, passed]) => !passed);
  if (blocking) process.exitCode = 1;
}

const [command = "help", ...argv] = process.argv.slice(2);

try {
  if (command === "install") installSkill(argv);
  else if (command === "uninstall") uninstallSkill(argv);
  else if (command === "doctor") doctor();
  else if (command === "help" || command === "--help" || command === "-h") printHelp();
  else await import("./index.mjs");
} catch (error) {
  console.error(`\nOpenDiff: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
