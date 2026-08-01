export function parseDiff(text) {
  const files = [];
  let current = null;
  let oldLine = 0;
  let newLine = 0;

  const flush = () => {
    if (!current) return;
    current.additions = current.lines.filter((line) => line.type === "addition").length;
    current.deletions = current.lines.filter((line) => line.type === "deletion").length;
    files.push(current);
    current = null;
  };

  for (const rawLine of text.split("\n")) {
    if (rawLine.startsWith("diff --git ")) {
      flush();
      const match = rawLine.match(/^diff --git a\/(.+) b\/(.+)$/);
      const oldPath = match?.[1] ?? "unknown";
      const newPath = match?.[2] ?? oldPath;
      current = {
        id: `${oldPath}:${newPath}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
        path: newPath,
        previousPath: oldPath !== newPath ? oldPath : undefined,
        status: "modified",
        additions: 0,
        deletions: 0,
        lines: [],
      };
      continue;
    }
    if (!current) continue;
    if (rawLine.startsWith("new file mode")) current.status = "added";
    if (rawLine.startsWith("deleted file mode")) current.status = "deleted";
    if (rawLine.startsWith("rename from") || rawLine.startsWith("rename to")) current.status = "renamed";
    if (rawLine.startsWith("Binary files") || rawLine.startsWith("GIT binary patch")) {
      current.status = "binary";
      if (!current.lines.some((line) => line.type === "binary")) current.lines.push({ type: "binary", content: "Binary file changed" });
      continue;
    }
    if (rawLine.startsWith("--- ") || rawLine.startsWith("+++ ")) continue;
    const hunkMatch = rawLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/);
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[3]);
      current.lines.push({ type: "hunk", content: rawLine, oldLine, newLine });
      continue;
    }
    if (rawLine === "\\ No newline at end of file") continue;
    if (rawLine.startsWith("+")) {
      current.lines.push({ type: "addition", newLine, content: rawLine.slice(1) });
      newLine += 1;
    } else if (rawLine.startsWith("-")) {
      current.lines.push({ type: "deletion", oldLine, content: rawLine.slice(1) });
      oldLine += 1;
    } else if (rawLine.startsWith(" ")) {
      current.lines.push({ type: "context", oldLine, newLine, content: rawLine.slice(1) });
      oldLine += 1;
      newLine += 1;
    }
  }
  flush();
  return files;
}
