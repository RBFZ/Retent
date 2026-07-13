// ============================================================
// Retent — Configuration Constants
// ============================================================

/** Capture engine defaults */
export const CAPTURE = {
  /** Default interval between passive captures (ms) */
  DEFAULT_INTERVAL_MS: 5000,
  /** Minimum time between any two captures (ms) */
  MIN_INTERVAL_MS: 2000,
  /** pHash similarity threshold — above this, frames are considered identical */
  HASH_SIMILARITY_THRESHOLD: 0.95,
  /** Text diff threshold — below this Levenshtein ratio, text is considered identical */
  TEXT_DIFF_THRESHOLD: 0.05,
  /** Debounce time after page load before auto-scan captures (ms) */
  AUTOSCAN_DEBOUNCE_MS: 1500,
  /** Max screenshots stored per profile before pruning oldest */
  MAX_SCREENSHOTS_PER_PROFILE: 500,
} as const;

/** LLM configuration */
export const LLM = {
  /** Default model identifier */
  DEFAULT_MODEL: "claude-sonnet-4-20250514",
  /** Max tokens for knowledge context injection */
  CONTEXT_BUDGET_TOKENS: 2000,
  /** Max tokens for LLM response */
  MAX_RESPONSE_TOKENS: 1024,
  /** Max conversation history messages to include */
  MAX_HISTORY_MESSAGES: 10,
  /** Keytar service name for API key storage */
  KEYTAR_SERVICE: "retent-api-keys",
  KEYTAR_ACCOUNT: "anthropic",
} as const;

/** Auto-scan defaults */
export const AUTOSCAN = {
  /** Default max scan duration (minutes) */
  DEFAULT_MAX_DURATION_MINUTES: 30,
  /** Max depth of navigation tree traversal */
  MAX_DEPTH_SHALLOW: 2,
  MAX_DEPTH_STANDARD: 4,
  MAX_DEPTH_DEEP: 8,
  /** Time to wait between navigation actions (ms) */
  ACTION_DELAY_MS: 2000,
} as const;

/** Overlay window dimensions */
export const OVERLAY = {
  DEFAULT_WIDTH: 380,
  DEFAULT_HEIGHT: 520,
  MIN_WIDTH: 300,
  MIN_HEIGHT: 400,
} as const;

/** Hotkey bindings */
export const HOTKEYS = {
  TOGGLE_OVERLAY: "CommandOrControl+Shift+R",
  TOGGLE_LEARNING: "CommandOrControl+Shift+L",
  ADD_ANNOTATION: "CommandOrControl+Shift+N",
} as const;

/** Database configuration */
export const DB = {
  /** Database filename */
  FILENAME: "retent.db",
  /** Profiles directory name within app data */
  PROFILES_DIR: "profiles",
  /** Screenshots directory name within app data */
  SCREENSHOTS_DIR: "screenshots",
} as const;

/** Supported starter profiles */
export const STARTER_PROFILES = [
  {
    id: "canvas-lms",
    displayName: "Canvas LMS",
    filename: "canvas.json",
    description: "Learning management system used by universities",
  },
] as const;
