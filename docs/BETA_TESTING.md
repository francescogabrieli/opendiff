# Five-user beta protocol

Run this protocol with five developers who did not contribute to OpenDiff. Do not guide them during installation; observe where the documentation or product fails on its own.

## Invitation

> OpenDiff turns coding-agent changes into a local guided review organized by implementation intent. Could you try the install and generate one review in a disposable or non-sensitive repository? It uploads no source and uses no additional model. I am testing whether the first-run flow works without assistance; please record where you hesitate or get stuck.

Send participants the canonical starting point: <https://github.com/francescogabrieli/opendiff#getting-started>.

## Scenario

1. Start with a Git repository containing one small intentional working-tree change.
2. Install the skill from the README.
3. Restart Codex or Claude Code when instructed.
4. Invoke `@opendiff` for a real change or ask it to explain the existing change through a guided review.
5. Open the review and inspect its decisions, invariants, evidence matrix, one code reference, and one file diff.
6. Run `git status --short` after the review.

Never ask participants to share proprietary source, credentials, or the complete `.opendiff/review.json`.

## Record for each participant

- operating system, Node version, and coding agent;
- whether installation completed without help;
- minutes from README arrival to the first visible review;
- whether `@opendiff` was recognized after restart;
- unexpected files in `git status --short`;
- warnings or errors, with sanitized output;
- one sentence describing what they believed OpenDiff did;
- one sentence explaining the change's mental model after reading the review;
- one failure mode or unverified criterion they noticed;
- whether they would use it again and why.

Use the repository's **Beta feedback** issue form for the report.

## Launch gate

Broad promotion is ready when:

- at least four of five participants reach a first review within five minutes without live assistance;
- all five finish with no OpenDiff-generated paths in Git status;
- no participant believes source code was uploaded;
- at least four participants can explain the central design decision without reading every changed file;
- at least four participants correctly identify one invariant and whether its evidence is complete;
- every blocking failure has either been fixed or documented with a direct recovery step;
- at least two participants complete a second review voluntarily or say they would use OpenDiff again.

Failures are product evidence, not participant mistakes. Fix repeated friction before widening the audience.
