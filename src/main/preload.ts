import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

const VALID_INVOKE_CHANNELS = [
  "llm:ask",
  "llm:set-api-key",
  "llm:has-api-key",
  "capture:toggle",
  "capture:annotate",
  "knowledge:get-facts",
  "knowledge:get-annotations",
  "knowledge:forget-fact",
  "knowledge:forget-annotation",
  "knowledge:forget-profile",
  "knowledge:get-stats",
  "profile:list",
  "profile:detect-app",
  "scan:configure",
  "scan:start",
  "scan:stop",
] as const;

const VALID_ON_CHANNELS = [
  "capture:new-state",
  "capture:status-change",
  "scan:progress",
  "scan:completed",
  "profile:updated",
] as const;

type InvokeChannel = (typeof VALID_INVOKE_CHANNELS)[number];
type OnChannel = (typeof VALID_ON_CHANNELS)[number];

contextBridge.exposeInMainWorld("retentAPI", {
  invoke(channel: InvokeChannel, ...args: unknown[]): Promise<unknown> {
    if (!VALID_INVOKE_CHANNELS.includes(channel)) {
      throw new Error(`Invalid invoke channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on(
    channel: OnChannel,
    callback: (...args: unknown[]) => void
  ): () => void {
    if (!VALID_ON_CHANNELS.includes(channel)) {
      throw new Error(`Invalid on channel: ${channel}`);
    }
    const listener = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
});
