import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  dialog,
} from "electron";
import path from "path";
import crypto from "crypto";
import { KnowledgeStore } from "./knowledge-store";
import { CaptureEngine } from "./capture";
import { OCRPipeline } from "./ocr";
import { ClaudeLLMEngine } from "./llm/claude";
import {
  OVERLAY,
  HOTKEYS,
  STARTER_PROFILES,
  CAPTURE,
  LLM,
} from "../shared/constants";
import type { Message, StateNode } from "../shared/types";

// --- App state ---

let mainWindow: BrowserWindow | null = null;
let knowledgeStore: KnowledgeStore;
let captureEngine: CaptureEngine;
let ocrPipeline: OCRPipeline;
let llmEngine: ClaudeLLMEngine;

let activeProfileId: string | null = null;
let conversationHistory: Message[] = [];
let previousStateId: string | null = null;

// --- Window creation ---

function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: OVERLAY.DEFAULT_WIDTH,
    height: OVERLAY.DEFAULT_HEIGHT,
    minWidth: OVERLAY.MIN_WIDTH,
    minHeight: OVERLAY.MIN_HEIGHT,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  return win;
}

// --- IPC handlers ---

function registerIpcHandlers(): void {
  // LLM
  ipcMain.handle("llm:ask", async (_event, question: string) => {
    if (!activeProfileId) {
      return "No active profile. Please wait for app detection or select a profile.";
    }

    const context = knowledgeStore.assembleContext(question, activeProfileId);
    const response = await llmEngine.ask({
      question,
      knowledgeContext: context,
      conversationHistory,
    });

    conversationHistory.push({ role: "user", content: question });
    conversationHistory.push({ role: "assistant", content: response });

    // Trim history
    if (conversationHistory.length > LLM.MAX_HISTORY_MESSAGES * 2) {
      conversationHistory = conversationHistory.slice(
        -(LLM.MAX_HISTORY_MESSAGES * 2)
      );
    }

    return response;
  });

  ipcMain.handle("llm:set-api-key", (_event, key: string) => {
    llmEngine.setApiKey(key);
  });

  ipcMain.handle("llm:has-api-key", () => {
    return llmEngine.hasApiKey();
  });

  // Capture
  ipcMain.handle("capture:toggle", () => {
    if (captureEngine.isRunning()) {
      captureEngine.pause();
      mainWindow?.webContents.send("capture:status-change", false);
    } else {
      captureEngine.resume();
      mainWindow?.webContents.send("capture:status-change", true);
    }
  });

  ipcMain.handle("capture:annotate", async (_event, note: string) => {
    if (!activeProfileId) return;
    const latestState = knowledgeStore.getLatestState(activeProfileId);
    if (latestState) {
      knowledgeStore.insertAnnotation({
        stateId: latestState.id,
        note,
        timestamp: new Date().toISOString(),
      });
      mainWindow?.webContents.send("profile:updated");
    }
  });

  // Knowledge queries
  ipcMain.handle("knowledge:get-facts", (_event, profileId: string) => {
    return knowledgeStore.getFactsByProfile(profileId);
  });

  ipcMain.handle("knowledge:get-annotations", (_event, profileId: string) => {
    return knowledgeStore.getAnnotationsByProfile(profileId);
  });

  ipcMain.handle("knowledge:forget-fact", (_event, factId: number) => {
    knowledgeStore.deleteFact(factId);
    mainWindow?.webContents.send("profile:updated");
  });

  ipcMain.handle(
    "knowledge:forget-annotation",
    (_event, annotationId: number) => {
      knowledgeStore.deleteAnnotation(annotationId);
      mainWindow?.webContents.send("profile:updated");
    }
  );

  ipcMain.handle("knowledge:forget-profile", (_event, profileId: string) => {
    knowledgeStore.deleteProfile(profileId);
    if (activeProfileId === profileId) {
      activeProfileId = null;
    }
    mainWindow?.webContents.send("profile:updated");
  });

  ipcMain.handle("knowledge:get-stats", (_event, profileId: string) => {
    return knowledgeStore.getProfileStats(profileId);
  });

  // Profiles
  ipcMain.handle("profile:list", () => {
    return knowledgeStore.listProfiles();
  });

  ipcMain.handle("profile:detect-app", () => {
    return activeProfileId;
  });
}

// --- Capture pipeline ---

function wireCapturesPipeline(): void {
  captureEngine.on("frame", async (frame) => {
    if (!activeProfileId) return;

    try {
      const ocrResult = await ocrPipeline.processFrame(frame.imageBuffer);
      if (!ocrResult.isNew) return;

      const stateId = crypto.randomUUID();
      const state: StateNode = {
        id: stateId,
        profileId: activeProfileId,
        ocrText: ocrResult.text,
        pHash: frame.pHash,
        timestamp: frame.timestamp,
        windowTitle: frame.windowTitle,
        url: frame.url,
      };

      knowledgeStore.insertState(state);

      // Record transition from previous state
      if (previousStateId) {
        knowledgeStore.insertTransition({
          profileId: activeProfileId,
          fromState: previousStateId,
          toState: stateId,
          timestamp: frame.timestamp,
        });
      }
      previousStateId = stateId;

      mainWindow?.webContents.send("capture:new-state", state);
    } catch (err) {
      console.error("Capture pipeline error:", err);
    }
  });

  captureEngine.on("error", (err) => {
    console.error("Capture engine error:", err);
  });
}

// --- Hotkeys ---

function registerHotkeys(): void {
  globalShortcut.register(HOTKEYS.TOGGLE_OVERLAY, () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });

  globalShortcut.register(HOTKEYS.TOGGLE_LEARNING, () => {
    if (captureEngine.isRunning()) {
      captureEngine.pause();
      mainWindow?.webContents.send("capture:status-change", false);
    } else {
      captureEngine.resume();
      mainWindow?.webContents.send("capture:status-change", true);
    }
  });

  globalShortcut.register(HOTKEYS.ADD_ANNOTATION, async () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();

    const { response, checkboxChecked } = await dialog.showMessageBox(
      mainWindow,
      {
        type: "question",
        buttons: ["Cancel", "Save"],
        defaultId: 1,
        title: "Add Note",
        message: "What would you like to remember about this screen?",
        // Dialog is limited; for a real annotation, we'd send an IPC event
        // to open an in-app annotation UI. This is a Phase 1 placeholder.
      }
    );
    // For Phase 1, annotation is done via the chat UI ("remember this: ...")
    // The hotkey just shows the overlay for now.
  });
}

// --- App lifecycle ---

function getProfilesDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "profiles");
  }
  // Dev: __dirname is dist/main/main/, profiles/ is at project root
  return path.join(__dirname, "../../../profiles");
}

async function initialize(): Promise<void> {
  // 1. Knowledge store
  knowledgeStore = new KnowledgeStore();

  // 2. Load starter profiles
  const profilesDir = getProfilesDir();
  for (const profileDef of STARTER_PROFILES) {
    knowledgeStore.loadStarterProfile(profileDef, profilesDir);
  }

  // Set active profile to first available
  const profiles = knowledgeStore.listProfiles();
  if (profiles.length > 0) {
    activeProfileId = profiles[0].id;
  }

  // 3. OCR pipeline
  ocrPipeline = new OCRPipeline();
  await ocrPipeline.initialize();

  // 4. Capture engine
  captureEngine = new CaptureEngine({
    mode: "interval",
    intervalMs: CAPTURE.DEFAULT_INTERVAL_MS,
    minIntervalMs: CAPTURE.MIN_INTERVAL_MS,
    hashThreshold: CAPTURE.HASH_SIMILARITY_THRESHOLD,
    textDiffThreshold: CAPTURE.TEXT_DIFF_THRESHOLD,
  });

  // 5. LLM engine
  llmEngine = new ClaudeLLMEngine();

  // 6. Create window
  mainWindow = createOverlayWindow();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 7. Register IPC and hotkeys
  registerIpcHandlers();
  registerHotkeys();

  // 8. Wire capture pipeline and start
  wireCapturesPipeline();
  captureEngine.start();
  console.log("Retent initialized. Capture engine running.");
}

app.whenReady().then(initialize).catch(console.error);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    mainWindow = createOverlayWindow();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  captureEngine?.stop();
  ocrPipeline?.shutdown();
  knowledgeStore?.close();
});
