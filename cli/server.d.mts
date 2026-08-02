import type { IncomingMessage, ServerResponse } from "node:http";

export type OpenDiffRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) => void;

export function createHandler(root: string): OpenDiffRequestHandler;
export function createStaticHandler(rendererRoot: string): OpenDiffRequestHandler;
export function createRequestHandler(repositoryRoot: string, rendererRoot: string): OpenDiffRequestHandler;
export function createOpenDiffPlugin(root?: string): {
  name: string;
  configureServer(server: { middlewares: { use(handler: OpenDiffRequestHandler): void } }): void;
  configurePreviewServer(server: { middlewares: { use(handler: OpenDiffRequestHandler): void } }): void;
};
