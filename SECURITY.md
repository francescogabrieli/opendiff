# Security policy

## Supported versions

OpenDiff is currently pre-1.0. Security fixes are applied to the latest release and to `main`; older pre-release versions are not maintained.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** option in the repository Security tab. If private vulnerability reporting is not available, contact the repository owner privately through the contact information on their GitHub profile and include `OpenDiff security` in the subject.

Include, when possible:

- the affected version or commit;
- reproduction steps or a minimal proof of concept;
- expected impact and prerequisites;
- suggested mitigations;
- whether the report may be credited publicly.

You should receive an acknowledgement within seven days. The maintainer will then validate the report, coordinate a fix and disclosure timeline, and credit the reporter when requested.

## Security boundaries

OpenDiff reads local Git data and agent-authored JSON, writes generated files under `.agent-diffs/` and `public/data/`, and serves a browser UI on `127.0.0.1`. It does not intentionally upload repository content or include telemetry.

Reports involving path traversal, unintended network exposure, arbitrary command execution, unsafe exported content, dependency compromise, or disclosure of repository data are in scope. Vulnerabilities in unsupported browsers or unmodified third-party dependencies should normally be reported upstream first.
