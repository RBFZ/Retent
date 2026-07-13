export {};

declare global {
  interface Window {
    retentAPI: {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
      on(channel: string, callback: (...args: unknown[]) => void): () => void;
    };
  }
}
