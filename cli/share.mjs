import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const PLACEHOLDER = '<script id="opendiff-data" type="application/json">null</script>';

// JSON is embedded in an HTML document, so anything the parser could read as
// markup has to stop being markup before it reaches the page.
function embedJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function buildSharedHtml({ templatePath, review, diff, mode }) {
  if (!existsSync(templatePath)) {
    throw new Error("The bundled share template is missing. Run `npm run build:share` in the OpenDiff checkout and try again.");
  }
  const template = readFileSync(templatePath, "utf8");
  if (!template.includes(PLACEHOLDER)) {
    throw new Error("The share template does not contain the OpenDiff data placeholder.");
  }
  const payload = { review, diff, mode, sharedAt: new Date().toISOString() };
  const replacement = `<script id="opendiff-data" type="application/json">${embedJson(payload)}</script>`;
  // A replacer function is required, not a convenience: as a plain string the
  // payload's `$&` and `$\`` sequences would be expanded by String.replace and
  // splice the surrounding bundle back into the page.
  return template.replace(PLACEHOLDER, () => replacement);
}

export const DEFAULT_SHARE_FILENAME = "opendiff-review.html";

export function gistAvailable() {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function uploadGist(filePath, description) {
  const output = execFileSync("gh", ["gist", "create", filePath, "--desc", description], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = output.trim().split("\n").filter(Boolean).pop();
  if (!url?.startsWith("http")) throw new Error("The GitHub CLI did not return a Gist URL.");
  return url;
}

export function shareTemplatePath(packageRoot) {
  return join(packageRoot, "dist-share", "opendiff-share.html");
}

export { PLACEHOLDER as SHARE_PLACEHOLDER };
