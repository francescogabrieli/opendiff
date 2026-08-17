import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
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

export function createHandler(root) {
  const agentDir = join(root, ".opendiff");
  const reviewPath = join(agentDir, "review.json");
  const renderStatusPath = join(agentDir, "render", "status.json");

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
        json(res, 404, { code: "missing-review", message: "No OpenDiff review was found. Ask the coding agent to generate .opendiff/review.json." });
        return;
      }
      json(res, 200, review);
      return;
    }
    if (requestUrl.pathname === "/__opendiff/data/diff") {
      const review = readDocument(reviewPath);
      if (!review) {
        json(res, 404, { code: "missing-review", message: "No OpenDiff review was found. Ask the coding agent to generate .opendiff/review.json." });
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
        // Reuse the fingerprint we just computed to report staleness, so the
        // renderer does not need a second full diff via /__opendiff/status.
        const renderedStatus = readDocument(renderStatusPath) || {};
        const recorded = renderedStatus.fingerprint || review.git?.fingerprint || null;
        json(res, 200, {
          files: collected.files,
          stats: collected.stats,
          fingerprint: collected.fingerprint,
          recordedFingerprint: recorded,
          stale: Boolean(recorded && collected.fingerprint !== recorded),
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
      const renderedStatus = readDocument(renderStatusPath) || {};
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

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendStaticFile(req, res, filePath) {
  const size = statSync(filePath).size;
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream");
  res.setHeader("Content-Length", size);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

export function createStaticHandler(rendererRoot) {
  const absoluteRoot = resolve(rendererRoot);
  const indexPath = join(absoluteRoot, "index.html");

  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method Not Allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    } catch {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    const requestedPath = pathname === "/" ? indexPath : resolve(absoluteRoot, `.${pathname}`);
    const isInsideRoot = requestedPath === absoluteRoot || (!relative(absoluteRoot, requestedPath).startsWith("..") && !relative(absoluteRoot, requestedPath).startsWith(sep));
    if (!isInsideRoot) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    const filePath = existsSync(requestedPath) && statSync(requestedPath).isFile() ? requestedPath : indexPath;
    if (!existsSync(filePath)) {
      res.statusCode = 503;
      res.end("The OpenDiff renderer has not been built.");
      return;
    }
    sendStaticFile(req, res, filePath);
  };
}

export function createRequestHandler(repositoryRoot, rendererRoot) {
  const dataHandler = createHandler(repositoryRoot);
  const staticHandler = createStaticHandler(rendererRoot);
  return (req, res) => dataHandler(req, res, () => staticHandler(req, res));
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
