// ============================================================
// Retent — Core Type Definitions
// ============================================================

// --- Knowledge Store Types ---

export interface AppProfile {
  id: string;
  appName: string;
  source: "starter" | "passive" | "active" | "auto-scan";
  createdAt: string;
  lastUpdated: string;
  settings?: AppProfileSettings;
}

export interface AppProfileSettings {
  /** URL patterns that identify this app (for web apps) */
  urlPatterns?: string[];
  /** Window title substrings that identify this app (for desktop apps) */
  windowTitlePatterns?: string[];
  /** Capture interval override in milliseconds */
  captureIntervalMs?: number;
}

export interface StateNode {
  id: string;
  profileId: string;
  screenshotPath?: string;
  ocrText: string;
  url?: string;
  windowTitle?: string;
  pHash: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface Transition {
  id: number;
  profileId: string;
  fromState: string;
  toState: string;
  actionDescription?: string;
  clickX?: number;
  clickY?: number;
  timestamp: string;
}

export interface Annotation {
  id: number;
  stateId: string;
  note: string;
  timestamp: string;
}

export type FactConfidence = "starter" | "observed" | "user-confirmed";

export interface Fact {
  id: number;
  profileId: string;
  stateId?: string;
  category?: string;
  key: string;
  value: string;
  confidence: FactConfidence;
  timestamp: string;
}

// --- Capture Engine Types ---

export interface CaptureFrame {
  imageBuffer: Buffer;
  pHash: string;
  timestamp: string;
  windowTitle?: string;
  url?: string;
}

export interface CaptureComparison {
  isNew: boolean;
  hashSimilarity: number;
  textSimilarity?: number;
  reason: "duplicate-hash" | "duplicate-text" | "new-state";
}

export type CaptureMode = "event" | "interval" | "auto-scan";

export interface CaptureConfig {
  mode: CaptureMode;
  intervalMs: number;
  minIntervalMs: number;
  hashThreshold: number;       // 0-1, default 0.95
  textDiffThreshold: number;   // 0-1, default 0.05
}

// --- LLM Types ---

export interface KnowledgeContext {
  appName: string;
  currentState: string;
  relevantFacts: Fact[];
  relevantAnnotations: Annotation[];
  navigationPaths?: string[];
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface LLMEngine {
  ask(params: {
    question: string;
    knowledgeContext: KnowledgeContext;
    conversationHistory: Message[];
  }): Promise<string>;
}

// --- Auto-Scan Types ---

export type ScanDepth = "shallow" | "standard" | "deep";

export interface ScanConfig {
  profileId: string;
  include: string[];
  exclude: string[];
  depth: ScanDepth;
  openAttachments: boolean;
  maxDurationMinutes: number;
}

export type ScanStatus = "idle" | "configuring" | "running" | "paused" | "completed" | "stopped";

export interface ScanProgress {
  status: ScanStatus;
  statesVisited: number;
  factsExtracted: number;
  elapsedMinutes: number;
  currentLocation?: string;
}

// --- UI Types ---

export type OverlayView = "chat" | "status" | "memory";

export type LearningStatus = "active" | "paused" | "off";

export interface AppState {
  activeView: OverlayView;
  activeProfile: AppProfile | null;
  learningStatus: LearningStatus;
  scanProgress: ScanProgress | null;
  conversationHistory: Message[];
}

// --- IPC Channel Types ---

/** Main → Renderer event channels */
export type MainToRendererChannel =
  | "capture:new-state"
  | "capture:status-change"
  | "scan:progress"
  | "scan:completed"
  | "profile:updated";

/** Renderer → Main request channels */
export type RendererToMainChannel =
  | "llm:ask"
  | "capture:toggle"
  | "capture:annotate"
  | "knowledge:get-facts"
  | "knowledge:get-annotations"
  | "knowledge:forget-fact"
  | "knowledge:forget-annotation"
  | "knowledge:forget-profile"
  | "profile:list"
  | "profile:detect-app"
  | "scan:configure"
  | "scan:start"
  | "scan:stop";
