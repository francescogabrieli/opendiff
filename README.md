# OpenDiff

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 20.19+](https://img.shields.io/badge/node-%3E%3D20.19-339933.svg)](package.json)
[![npm](https://img.shields.io/npm/v/%40francescogabrieli%2Fopendiff.svg)](https://www.npmjs.com/package/@francescogabrieli/opendiff)

OpenDiff turns a coding agent's working-tree changes into a local, idea-first review. The same agent records the design and evidence; OpenDiff validates them against the real Git diff and lets you inspect code on demand.

![OpenDiff guided review](docs/opendiff-demo.gif)

OpenDiff is **local-first** and **deterministic**. It does not upload source code, call an additional model, create a pull request, or modify source files or Git state. Local review artifacts remain ignored under `.opendiff/`.

## Why use OpenDiff?

Agent-generated changes are often easier to produce than to understand. A raw diff tells you what changed, but not whether the design is sound, which invariants matter, which claims have evidence, or where uncertainty remains.

OpenDiff gives you three connected views:

- **Design** explains the problem, desired outcome, decisions, alternatives, invariants, non-goals, and deviations.
- **Evidence** connects acceptance criteria to tests, checks, risks, and precise implementation references.
- **Diff** provides the complete staged, unstaged, and untracked Git change for line-level inspection.

OpenDiff also detects stale reviews when the working tree changes after the review was generated.

## Requirements

- **Node.js 20.19 or newer**
- **Git**
- **Codex and/or Claude Code**

No account, remote service, or API key is required.

## Install

Install the OpenDiff skill once:

```bash
npx --yes @francescogabrieli/opendiff@latest install
```

The installer detects Codex and Claude Code automatically. To select one explicitly:

```bash
npx --yes @francescogabrieli/opendiff@latest install --agent codex
npx --yes @francescogabrieli/opendiff@latest install --agent claude
npx --yes @francescogabrieli/opendiff@latest install --agent all
```

Restart an agent that was already open after installation.

## Create your first review

Open a Git repository in your coding agent and ask it to implement a change:

```text
@opendiff implementa questa modifica e mostrami la review
```

You can also review changes already present in the working tree:

```text
@opendiff spiegami queste modifiche con una review, senza cambiare il codice
```

The agent captures the Git baseline, records the design, performs the work, runs relevant checks, validates the final review, and opens OpenDiff in your browser.

You do not need to run any OpenDiff command during the normal workflow.

## Read a review

Start with **Design** and decide whether the proposed mental model is correct. Then use **Evidence** to inspect verified and unverified criteria, checks, risks, and implementation references. Open **Diff** only when you need complete line-level context.

Clicking a criterion in Design opens its supporting evidence. Clicking an implementation reference jumps to the corresponding changed lines.

OpenDiff clearly distinguishes:

- verified criteria from claims without evidence;
- executed checks from checks that were skipped;
- current reviews from reviews made stale by later working-tree changes;
- resolved code references from missing or outdated references.

## Useful commands

The installed skill normally runs OpenDiff for you. These commands are available when you need them:

| Command | When to use it |
| --- | --- |
| `opendiff doctor` | Check Node.js, Git, the bundled renderer, and agent installation. |
| `opendiff review` | Validate and open the review in the current repository. |
| `opendiff review --no-open` | Start the local review server without opening a browser. |
| `opendiff export --output PATH` | Create a portable static review folder. |
| `opendiff install --force` | Repair or refresh the installed agent skill. |
| `opendiff uninstall` | Remove the installed skill. |

When invoking commands without a global installation, use the npm package:

```bash
npx --yes @francescogabrieli/opendiff@latest doctor
npx --yes @francescogabrieli/opendiff@latest review
```

## Troubleshooting

### The `@opendiff` skill is not recognized

Restart Codex or Claude Code after installation. If the problem continues:

```bash
npx --yes @francescogabrieli/opendiff@latest doctor
npx --yes @francescogabrieli/opendiff@latest install --force
```

### The browser does not open

Run the review without automatic browser launch:

```bash
npx --yes @francescogabrieli/opendiff@latest review --no-open
```

Open the local URL printed by the command. Keep that terminal process running while reading the review.

### The review is stale

The working tree changed after the review was generated. Ask the implementing agent to refresh the review against the final diff, then reopen it.

### A reference cannot be resolved

The referenced file or line range no longer matches the current working tree. The rest of the review remains available, but the agent should regenerate its references before you rely on that explanation.

## Privacy and sharing

The OpenDiff server binds to `127.0.0.1`. Source code and review data stay on your machine, and OpenDiff includes no telemetry or remote source-code transport.

Review narratives and exported folders can still contain sensitive repository context. Inspect an exported review before sharing it with another person.

## Support

For reproducible bugs or usage problems, see [SUPPORT.md](SUPPORT.md). Include your OpenDiff version, operating system, Node.js version, exact command, and sanitized output. Do not attach proprietary source code or a sensitive `.opendiff/review.json` without permission.

Report security vulnerabilities privately using [SECURITY.md](SECURITY.md).

OpenDiff is pre-1.0, so CLI and interface behavior may evolve between minor releases. It is released under the MIT License.

OpenDiff is independent and is not affiliated with or endorsed by Linear.
