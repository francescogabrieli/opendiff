# OpenDiff design

OpenDiff is an idea-first, evidence-backed review format for changes made by coding agents.

The product exists because generated code is cheap to produce but system understanding and verification are not. A reviewer should first decide whether the proposed model is sound, whether its invariants are the right ones, and whether the available evidence supports the claims. Source code remains available as evidence and for focused inspection; reading every changed line is not the default completion criterion.

## Core model

OpenDiff separates three authorities:

1. **The implementing agent owns the design narrative.** It records the problem, desired outcome, decisions, alternatives, invariants, non-goals, deviations, risks, and claims.
2. **Git owns source facts.** The CLI derives changed files, line contents, statistics, and the working-tree fingerprint. Narrative never substitutes for the real diff.
3. **Executed checks own verification facts.** A claim is verified only when it points to concrete evidence such as a test, benchmark, manual observation, design document, or code reference. Missing evidence remains visible.

The renderer is a deterministic projection of those inputs. It does not call a model, reinterpret the implementation, or silently upgrade an unsupported claim.

## Review sequence

A schema 2.0 review should be read in this order:

1. problem and desired outcome;
2. decisions and rejected alternatives;
3. invariants and acceptance criteria;
4. evidence, gaps, deviations, and risks;
5. implementation sections and code references on demand.

The normal workflow captures this model before implementation, then reconciles it with the final working tree. A deviation is not automatically a defect; an undisclosed deviation is.

## Invariants

- Repository content never leaves the machine through OpenDiff.
- The renderer never calls a model or invents verification.
- Git-derived facts cannot be overridden by the authored review.
- A schema 2.0 criterion marked `verified` has at least one evidence record.
- Existing schema 1.0 reviews remain readable during the 2.0 transition.
- Source and Git state are never staged, committed, reset, or rewritten by OpenDiff.

## Scope discipline

OpenDiff is not an autonomous reviewer, a hosted collaboration service, a replacement for tests, or a guarantee that an implementation is correct. It is the contract and local interface that make design claims and their supporting evidence inspectable.
