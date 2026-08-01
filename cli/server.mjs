import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectDiff,
  getBaseCommit,
  getGitRoot,
  loadConfig,
} from "./git.mjs";

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

function readDocument(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function createHandler(root) {
  const agentDir = join(root, ".agent-diffs");
  const reviewPath = join(agentDir, "review.json");
  const renderStatusPath = join(agentDir, "render", "status.json");
  const publicStatusPath = join(root, "public", "data", "status.json");

  return (req, res, next) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    if (!requestUrl.pathname.startsWith("/__opendiff/")) {
      next?.();
      return;
    }
    const gitRoot = getGitRoot(root);
    if (!gitRoot) {
      json(res, 400, { code: "unavailable", message: "OpenDiff could not find a Git repository from the current directory." });
      return;
    }
    if (requestUrl.pathname === "/__opendiff/data/review") {
      const review = readDocument(reviewPath);
      if (!review) {
        json(res, 404, { code: "missing-review", message: "No OpenDiff review was found. Ask the coding agent to generate .agent-diffs/review.json." });
        return;
      }
      json(res, 200, review);
      return;
    }
    if (requestUrl.pathname === "/__opendiff/data/diff") {
      const review = readDocument(reviewPath);
      if (!review) {
        json(res, 404, { code: "missing-review", message: "No OpenDiff review was found. Ask the coding agent to generate .agent-diffs/review.json." });
        return;
      }
      try {
        const config = loadConfig(root);
        const context = Number(requestUrl.searchParams.get("context")) || config.defaultContextLines || 5;
        const base = requestUrl.searchParams.get("base") || review.git?.baseRef || config.baseRef;
        const collected = collectDiff({
          root,
          base,
          context,
          includeStaged: review.git?.includeStaged !== false && config.includeStaged,
          includeUnstaged: review.git?.includeUnstaged !== false && config.includeUnstaged,
          includeUntracked: review.git?.includeUntracked !== false && config.includeUntracked,
          ignoredPaths: config.ignoredPaths,
          generatedPaths: config.generatedPaths,
        });
        json(res, 200, {
          files: collected.files,
          stats: collected.stats,
          fingerprint: collected.fingerprint,
          baseRef: base,
          baseCommit: getBaseCommit(root, base),
          renderedAt: new Date().toISOString(),
        });
      } catch (error) {
        json(res, 422, { code: "missing-base", message: error.message || "The selected Git base is unavailable." });
      }
      return;
    }
    if (requestUrl.pathname === "/__opendiff/status") {
      const renderedStatus = readDocument(renderStatusPath) || readDocument(publicStatusPath) || {};
      const review = readDocument(reviewPath);
      if (!review) {
        json(res, 404, { code: "missing-review", message: "No OpenDiff review was found." });
        return;
      }
      try {
        const config = loadConfig(root);
        const base = review.git?.baseRef || config.baseRef;
        const current = collectDiff({
          root,
          base,
          context: config.defaultContextLines,
          includeStaged: review.git?.includeStaged !== false && config.includeStaged,
          includeUnstaged: review.git?.includeUnstaged !== false && config.includeUnstaged,
          includeUntracked: review.git?.includeUntracked !== false && config.includeUntracked,
          ignoredPaths: config.ignoredPaths,
          generatedPaths: config.generatedPaths,
        });
        const recorded = renderedStatus.fingerprint || review.git?.fingerprint || null;
        json(res, 200, {
          stale: Boolean(recorded && current.fingerprint !== recorded),
          fingerprint: recorded,
          currentFingerprint: current.fingerprint,
          renderedAt: renderedStatus.renderedAt || review.review?.generatedAt,
        });
      } catch (error) {
        json(res, 422, { code: "missing-base", message: error.message || "The selected Git base is unavailable." });
      }
      return;
    }
    next?.();
  };
}

export function createOpenDiffPlugin(root = process.cwd()) {
  const handler = createHandler(root);
  return {
    name: "opendiff-data",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

