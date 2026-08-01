import { createHighlighter, type BundledLanguage, type SpecialLanguage } from "shiki";
import type { DiffLine } from "../types";

const highlighterPromises = new Map<string, ReturnType<typeof createHighlighter>>();

const languageMap: Record<string, string> = {
  TypeScript: "typescript",
  TSX: "tsx",
  JavaScript: "javascript",
  JSX: "jsx",
  JSON: "json",
  CSS: "css",
  SCSS: "scss",
  HTML: "html",
  YAML: "yaml",
  Markdown: "markdown",
  Python: "python",
  Go: "go",
  Rust: "rust",
  Shell: "bash",
  SQL: "sql",
  XML: "xml",
  Text: "text",
};

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function getHighlighter(language: BundledLanguage | SpecialLanguage) {
  const key = String(language);
  const existing = highlighterPromises.get(key);
  if (existing) return existing;
  const highlighterPromise = createHighlighter({
    themes: ["github-dark-dimmed"],
    langs: [language],
  });
  highlighterPromises.set(key, highlighterPromise);
  return highlighterPromise;
}

export async function highlightFileLines(lines: DiffLine[], language: string): Promise<Record<string, string>> {
  const lang = (languageMap[language] ?? "text") as BundledLanguage | SpecialLanguage;
  const targetLines = lines.filter((line) => line.type !== "hunk" && line.type !== "binary").slice(0, 8000);
  if (!targetLines.length) return {};
  try {
    const highlighter = await getHighlighter(lang);
    const tokenLines = highlighter.codeToTokens(targetLines.map((line) => line.content).join("\n"), { lang, theme: "github-dark-dimmed" }).tokens;
    return Object.fromEntries(targetLines.map((line, index) => [
      line.id,
      (tokenLines[index] ?? []).map((token) => `<span${token.color ? ` style="color:${token.color}"` : ""}>${escapeHtml(token.content)}</span>`).join(""),
    ]));
  } catch {
    return {};
  }
}
