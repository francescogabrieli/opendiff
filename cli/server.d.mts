import type { IncomingMessage, ServerResponse } from "node:http";

export type OpenDiffsRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) => void;

export function createHandler(root: string): OpenDiffsRequestHandler;
export function createStaticHandler(rendererRoot: string): OpenDiffsRequestHandler;
export function createRequestHandler(repositoryRoot: string, rendererRoot: string): OpenDiffsRequestHandler;
export function createOpenDiffsPlugin(root?: string): {
  name: string;
  configureServer(server: { middlewares: { use(handler: OpenDiffsRequestHandler): void } }): void;
  configurePreviewServer(server: { middlewares: { use(handler: OpenDiffsRequestHandler): void } }): void;
};
