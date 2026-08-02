import githubDarkDimmed from "@shikijs/themes/github-dark-dimmed";
import { createHighlighterCore, type HighlighterCore, type LanguageInput, type SpecialLanguage } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { DiffLine } from "../types";

type SupportedLanguage = Exclude<keyof typeof languageLoaders, SpecialLanguage> | SpecialLanguage;

const languageLoaders = {
  bash: () => import("@shikijs/langs/bash"),
  css: () => import("@shikijs/langs/css"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  markdown: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  scss: () => import("@shikijs/langs/scss"),
  sql: () => import("@shikijs/langs/sql"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
} as const;

const languageMap: Record<string, SupportedLanguage> = {
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

const highlighterPromise = createHighlighterCore({
  themes: [githubDarkDimmed],
  langs: [],
  engine: createJavaScriptRegexEngine(),
});
const languagePromises = new Map<string, Promise<void>>();

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

async function loadLanguage(highlighter: HighlighterCore, language: SupportedLanguage): Promise<void> {
  if (language === "text" || language === "plaintext" || language === "ansi") return;
  const existing = languagePromises.get(language);
  if (existing) return existing;
  const loader = languageLoaders[language as keyof typeof languageLoaders];
  const loading = highlighter.loadLanguage(loader() as LanguageInput).then(() => undefined);
  languagePromises.set(language, loading);
  return loading;
}

export async function highlightFileLines(lines: DiffLine[], language: string): Promise<Record<string, string>> {
  const lang = languageMap[language] ?? "text";
  const targetLines = lines.filter((line) => line.type !== "hunk" && line.type !== "binary").slice(0, 8000);
  if (!targetLines.length) return {};
  try {
    const highlighter = await highlighterPromise;
    await loadLanguage(highlighter, lang);
    const tokenLines = highlighter.codeToTokens(targetLines.map((line) => line.content).join("\n"), { lang, theme: "github-dark-dimmed" }).tokens;
    return Object.fromEntries(targetLines.map((line, index) => [
      line.id,
      (tokenLines[index] ?? []).map((token) => `<span${token.color ? ` style="color:${token.color}"` : ""}>${escapeHtml(token.content)}</span>`).join(""),
    ]));
  } catch {
    return {};
  }
}
