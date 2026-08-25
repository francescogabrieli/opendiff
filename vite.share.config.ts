import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Builds the template used by `opendiff share`: one HTML file with every
// script, style, and syntax-highlighting grammar inlined, so a shared review
// opens from disk, an email attachment, or a Gist with no network at all.
function inlineEverything(outDir: string): Plugin {
  return {
    name: "opendiff-inline-single-file",
    enforce: "post",
    // Runs on the written output rather than the in-memory bundle so it cannot
    // race Vite's own HTML emit, whatever the plugin ordering ends up being.
    closeBundle() {
      const root = resolve(outDir);
      const indexPath = join(root, "index.html");
      if (!existsSync(indexPath)) throw new Error("share build produced no index.html");
      let source = readFileSync(indexPath, "utf8");

      source = source.replace(
        /<script[^>]*src="([^"]+)"[^>]*><\/script>/g,
        (tag, src: string) => {
          const asset = assetPath(root, src);
          if (!asset) return tag;
          return `<script type="module">${escapeClosingTag(readFileSync(asset, "utf8"))}</script>`;
        },
      );

      source = source.replace(
        /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
        (tag, href: string) => {
          const asset = assetPath(root, href);
          if (!asset) return tag;
          return `<style>${readFileSync(asset, "utf8")}</style>`;
        },
      );

      source = source.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, "");

      // The CLI replaces this placeholder with the review payload at share time,
      // so sharing stays instant and never needs a build step on the user's machine.
      source = source.replace(
        "</head>",
        '  <script id="opendiff-data" type="application/json">null</script>\n  </head>',
      );

      const remaining = [...source.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((match) => match[1]);
      if (remaining.length) {
        throw new Error(`share build left external references: ${remaining.join(", ")}`);
      }

      writeFileSync(join(root, "opendiff-share.html"), source);
      rmSync(indexPath, { force: true });
      rmSync(join(root, "assets"), { recursive: true, force: true });
    },
  };
}

function assetPath(root: string, url: string): string | null {
  if (!url.startsWith("/")) return null;
  const candidate = join(root, url.slice(1));
  return existsSync(candidate) ? candidate : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeClosingTag(code: string): string {
  return code.replaceAll("</script", "<\\/script");
}

const shareOutDir = "dist-share";

export default defineConfig({
  publicDir: false,
  plugins: [react(), inlineEverything(shareOutDir)],
  build: {
    outDir: shareOutDir,
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
