export function createOpenDiffPlugin(root?: string): {
  name: string;
  configureServer(server: unknown): void;
  configurePreviewServer(server: unknown): void;
};
