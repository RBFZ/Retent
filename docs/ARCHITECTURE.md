# Retent — System Architecture

## Overview

Retent is an Electron-based desktop overlay that learns application layouts through observation and builds per-app knowledge bases to ground LLM responses in actual UI context. This document describes the system design, data flow, and key technical decisions.

---

## 1. High-Level Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                        USER'S SCREEN                          │
│                                                                │
│   ┌─────────────────────┐    ┌──────────────────────────────┐ │
│   │  Target Application │    │  Retent Overlay (floating)   │ │
│   │  (Canvas, Avogadro, │    │                              │ │
│   │   Overleaf, etc.)   │    │  [Chat] [Status] [Memory]   │ │
│   │                     │    │                              │ │
│   └─────────────────────┘    └──────────┬───────────────────┘ │
└─────────────────────────────────────────┼─────────────────────┘
                                          │
                    ┌─────────────────────┼──────────────────────┐
                    │            MAIN PROCESS                     │
                    │                                             │
                    │  ┌─────────────┐  ┌──────────────────────┐ │
                    │  │  Capture    │  │  Knowledge Store     │ │
                    │  │  Engine     │──▶│                      │ │
                    │  │             │  │  SQLite database      │ │
                    │  │ • Screenshot│  │  Per-app profiles     │ │
                    │  │ • OCR       │  │  State graph          │ │
                    │  │ • pHash     │  │  User annotations     │ │
                    │  │ • Diff      │  │                      │ │
                    │  └─────────────┘  └──────────┬───────────┘ │
                    │                              │             │
                    │  ┌─────────────┐             │             │
                    │  │  LLM Engine │◀────────────┘             │
                    │  │             │                           │
                    │  │  Context    │──── Anthropic API ────▶   │
                    │  │  assembly + │◀── (text only, no       │ │
                    │  │  response   │     screenshots sent)    │ │
                    │  └─────────────┘                           │
                    │                                             │
                    │  ┌─────────────┐                           │
                    │  │  Auto-Scan  │  (Phase 3)                │
                    │  │  Engine     │                           │
                    │  │             │                           │
                    │  │  Read-only  │                           │
                    │  │  navigation │                           │
                    │  └─────────────┘                           │
                    └────────────────────────────────────────────┘
```

---

## 2. Capture Engine

### 2.1 Trigger Modes

The capture engine operates in three modes depending on the active learning layer:

**Event-triggered (Passive Learning)**
- Hooks into system-level focus changes and click events
- Captures a screenshot when the user performs a meaningful action
- Uses `globalShortcut` and `screen` APIs in Electron
- Capture interval minimum: 2 seconds (prevents burst captures during rapid clicking)

**Interval-triggered (Background Observation)**
- Captures at configurable intervals (default: 5 seconds)
- Only runs when the target application is in the foreground
- Pauses automatically when the user switches to a different app
- Resumes when the target app regains focus

**Command-triggered (Auto-Scan)**
- Captures after each navigation action the scanner performs
- Waits for page/content to stabilize before capturing (debounce: 1.5 seconds after last DOM mutation or load event)
- Guarantees one clean frame per navigated state

### 2.2 Screenshot Pipeline

```
desktopCapturer.getSources()
        │
        ▼
  Capture full screen or target window
        │
        ▼
  NativeImage → PNG buffer
        │
        ├──▶ Perceptual Hash (pHash)
        │         │
        │         ▼
        │    Compare to last stored state's pHash
        │         │
        │    Similarity > 95%? ──── YES ──→ DISCARD
        │         │
        │         NO
        │         │
        ▼         ▼
  Run Tesseract.js OCR
        │
        ▼
  Compare extracted text to last stored state's text
        │
  Levenshtein distance < 5%? ──── YES ──→ DISCARD
        │
        NO
        │
        ▼
  Create new StateNode
  Store screenshot to disk
  Insert into SQLite
  Log transition from previous state
```

### 2.3 Perceptual Hashing

We use a DCT-based perceptual hash (pHash) rather than exact pixel comparison because:
- Tolerates minor rendering differences (anti-aliasing, cursor position)
- Fast computation (~2ms per frame)
- Hamming distance comparison is O(1)
- 95% threshold catches "same page, cursor moved" while allowing "same page, modal opened"

Library: `sharp` for image processing + custom pHash implementation or `imghash` package.

### 2.4 OCR Pipeline

**Tesseract.js** runs entirely client-side with no API dependency.

Configuration:
- Language: `eng` (expandable)
- PSM (Page Segmentation Mode): `3` (fully automatic)
- Pre-processing: Convert to grayscale, increase contrast for better recognition
- Post-processing: Strip excessive whitespace, normalize line breaks

OCR output is stored as plaintext in the StateNode. For structured extraction (dates, assignment names, due dates), a secondary parsing pass runs regex patterns specific to the active app profile.

---

## 3. Knowledge Store

### 3.1 Database Design

SQLite via `better-sqlite3` (synchronous, fast, no native compilation issues in Electron).

```sql
-- Application profiles
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    app_name TEXT NOT NULL,
    source TEXT CHECK(source IN ('starter', 'passive', 'active', 'auto-scan')),
    created_at TEXT NOT NULL,
    last_updated TEXT NOT NULL,
    settings TEXT  -- JSON blob for app-specific config
);

-- State nodes (screens/pages the app has been observed in)
CREATE TABLE states (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    screenshot_path TEXT,
    ocr_text TEXT NOT NULL,
    url TEXT,
    window_title TEXT,
    phash TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    metadata TEXT,  -- JSON blob for extracted structured data
    UNIQUE(profile_id, phash)
);

-- Transitions between states
CREATE TABLE transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    from_state TEXT NOT NULL REFERENCES states(id),
    to_state TEXT NOT NULL REFERENCES states(id),
    action_description TEXT,
    click_x INTEGER,
    click_y INTEGER,
    timestamp TEXT NOT NULL
);

-- User annotations
CREATE TABLE annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state_id TEXT NOT NULL REFERENCES states(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

-- Extracted facts (structured knowledge derived from states)
CREATE TABLE facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    state_id TEXT REFERENCES states(id) ON DELETE SET NULL,
    category TEXT,          -- "exam_date", "assignment", "navigation", "setting"
    key TEXT NOT NULL,      -- "midterm_date", "final_date", "modules_tab_location"
    value TEXT NOT NULL,    -- "October 15, 2026", "left sidebar → Modules"
    confidence TEXT CHECK(confidence IN ('starter', 'observed', 'user-confirmed')),
    timestamp TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_states_profile ON states(profile_id);
CREATE INDEX idx_facts_profile ON facts(profile_id);
CREATE INDEX idx_facts_category ON facts(category);
CREATE INDEX idx_transitions_profile ON transitions(profile_id);
```

### 3.2 Profile Lifecycle

```
Install Retent
      │
      ▼
  First launch: "What app are you using?"
      │
      ├──── Supported app selected ────▶ Load starter profile from /profiles/
      │                                        │
      │                                        ▼
      │                                  Profile active, Layer 1 ready
      │                                        │
      └──── Custom app name entered ────▶ Create empty profile
                                               │
                                               ▼
                                         Layer 2 passive learning begins
                                         (no starter data, learning from scratch)
```

### 3.3 Context Assembly for LLM

When the user asks a question, the Knowledge Store assembles a context payload:

1. **Identify active profile** — Match current foreground window title/URL to a profile
2. **Retrieve current state** — Find the StateNode closest to the current screenshot (by pHash or URL)
3. **Gather relevant facts** — Query `facts` table for the active profile, filtered by relevance to the question (keyword match against fact keys/values)
4. **Include user annotations** — Pull any annotations attached to nearby states
5. **Include navigation context** — If the question is "how do I get to X?", traverse the transition graph to find paths to states containing X in their OCR text
6. **Assemble prompt** — Inject all of the above into the system prompt, structured as knowledge base context

**Context budget:** Keep injected knowledge under ~2000 tokens to leave room for conversation history and the LLM's response. Prioritize user-confirmed facts > observed facts > starter facts.

---

## 4. Auto-Scan Engine

### 4.1 Navigation Strategy

The auto-scanner treats the target application as a tree to explore:

```
Dashboard (root)
├── Course 1
│   ├── Modules
│   │   ├── Module 1
│   │   │   ├── Assignment 1.1
│   │   │   └── Assignment 1.2
│   │   └── Module 2
│   ├── Syllabus
│   ├── Grades
│   └── Calendar
├── Course 2
│   └── ...
└── Course 3 (excluded by user)
```

Exploration algorithm:
1. Start at the root state (current page when scan begins)
2. Identify all clickable elements via DOM inspection or OCR-detected links
3. Filter against safety rules (no forms, no downloads, no external links)
4. Visit each allowed element depth-first
5. At each new state: capture, OCR, store, extract facts
6. Backtrack via browser history or known navigation paths
7. Continue until all reachable states within user-defined scope are visited
8. Respect `maxDuration` — auto-stop after the configured time limit

### 4.2 Pre-Scan Setup Flow

Before any auto-scan, the user is presented with a brief setup dialog:

```
┌─────────────────────────────────────────┐
│        Set up your Canvas scan          │
│                                         │
│  Which classes should I look through?   │
│  ☑ HIST 1301 - US History to 1877       │
│  ☑ MUSI 1306 - Music Appreciation       │
│  ☐ GEOL 1303 - Physical Geology (old)   │
│                                         │
│  Should I open file attachments?        │
│  ○ Yes, preview them    ● Just note them│
│                                         │
│  How thorough?                          │
│  ○ Quick (tabs + main pages only)       │
│  ● Standard (modules + assignments)     │
│  ○ Deep (everything reachable)          │
│                                         │
│  Time limit: [30 minutes ▼]             │
│                                         │
│  [Start Scan]              [Cancel]     │
└─────────────────────────────────────────┘
```

### 4.3 Web App vs Desktop App Scanning

**Web apps (Canvas, Overleaf, web portals):**
- Use Electron `webContents` to inspect DOM
- Click elements via `webContents.executeJavaScript()`
- Navigate via URL manipulation and DOM click events
- DOM inspection provides rich element identification

**Desktop apps (Avogadro, native tools):**
- Fall back to coordinate-based interaction via system-level input simulation
- Heavier reliance on OCR for element identification
- More conservative navigation — larger debounce times, stricter safety rules
- Phase 4+ feature; Phase 1-3 focus on web apps

---

## 5. LLM Integration

### 5.1 Model Interface

```typescript
interface LLMEngine {
  ask(params: {
    question: string;
    knowledgeContext: KnowledgeContext;
    conversationHistory: Message[];
    currentScreenshot?: string;  // OCR text of current screen, NOT the image
  }): Promise<string>;
}

interface KnowledgeContext {
  appName: string;
  currentState: string;         // OCR text of current/recent state
  relevantFacts: Fact[];
  relevantAnnotations: Annotation[];
  navigationPaths?: string[];   // If question involves "where is X?"
}
```

### 5.2 Prompt Construction

The system prompt is assembled dynamically per query:

```typescript
function buildSystemPrompt(ctx: KnowledgeContext): string {
  return `You are Retent, an AI assistant with specific, observed knowledge 
about the user's software environment.

RULES:
1. Answer from the KNOWLEDGE BASE FIRST. This is information gathered from 
   the user's actual application — it is more reliable than your general knowledge.
2. If the knowledge base contains the answer, provide it directly and 
   confidently.
3. If the knowledge base does NOT contain relevant information, you may use 
   general knowledge but MUST prefix your answer with: "I don't have specific 
   knowledge about this in your app, but generally..."
4. Never fabricate specific locations, paths, or UI elements. If you don't 
   know where something is, say so.
5. When providing navigation instructions, use the observed transition paths 
   when available.

[ACTIVE APP]: ${ctx.appName}
[CURRENT SCREEN]: ${ctx.currentState}

[KNOWN FACTS]:
${ctx.relevantFacts.map(f => `- ${f.key}: ${f.value} (${f.confidence})`).join('\n')}

[USER NOTES]:
${ctx.relevantAnnotations.map(a => `- ${a.note}`).join('\n')}

${ctx.navigationPaths ? `[NAVIGATION PATHS]:\n${ctx.navigationPaths.join('\n')}` : ''}`;
}
```

### 5.3 Model Swapping

The Claude implementation is behind the `LLMEngine` interface. Future implementations for other providers (OpenAI, local models via Ollama) can be added by implementing the same interface. The user selects their preferred model in settings. API keys are stored in the system keychain via `keytar` (not in plaintext config files).

---

## 6. Overlay Window

### 6.1 Window Properties

```typescript
const overlayWindow = new BrowserWindow({
  width: 380,
  height: 520,
  alwaysOnTop: true,
  frame: false,           // Custom title bar
  transparent: true,      // Rounded corners, no background bleed
  resizable: true,
  skipTaskbar: false,      // Visible in taskbar for easy access
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
});

// Click-through when not focused — overlay doesn't block interaction
overlayWindow.setIgnoreMouseEvents(false);
```

### 6.2 UI States

The overlay has three main views accessible via tabs or hotkeys:

**Chat (default):** Text input + conversation history. Questions go to the LLM with knowledge context injected. Compact, minimal — no wall of text.

**Status:** Shows current learning state:
- Which app is detected
- Whether passive learning is active
- Last capture timestamp
- Knowledge base stats (X states, Y facts, Z annotations)
- Auto-scan progress (if running)

**Memory:** Browse and manage the knowledge base:
- List of known facts, grouped by category
- User annotations
- "Forget" button per fact/annotation
- "Forget all for [app]" for full profile reset
- "Forget [semester/category]" for bulk cleanup

### 6.3 Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+R` | Toggle overlay visibility |
| `Ctrl+Shift+L` | Toggle passive learning on/off |
| `Ctrl+Shift+N` | Add annotation to current state ("remember this") |
| `Escape` | Minimize overlay |

---

## 7. App Detection

Retent needs to know which application is currently active to load the right profile.

**Web apps:** Read the URL from the active browser tab. Match against known patterns:
- `*.instructure.com/*` → Canvas LMS
- `www.overleaf.com/project/*` → Overleaf
- Custom patterns configurable per profile

**Desktop apps:** Read the window title via Electron's `screen` and system APIs. Match against profile names:
- Window title contains "Avogadro" → Avogadro profile
- Window title contains "QuickBooks" → QuickBooks profile

**Fallback:** If no profile matches, prompt the user: "I don't recognize this app. Would you like to start learning it?"

---

## 8. Data Privacy Design

### 8.1 Data Flow Boundaries

```
LOCAL ONLY (never leaves device):
  • Raw screenshots
  • SQLite database
  • OCR'd text stored on disk
  • User annotations
  • Perceptual hashes
  • Navigation logs

SENT TO API (text only):
  • Assembled knowledge context (extracted facts, OCR text snippets)
  • User's question
  • Conversation history for the current session

NEVER SENT:
  • Raw screenshot images
  • Full OCR dumps
  • File contents from scanned attachments
  • System information beyond app name
```

### 8.2 API Key Storage

API keys are stored using the OS keychain via `keytar`:
- macOS: Keychain
- Windows: Credential Vault  
- Linux: libsecret

Never stored in config files, environment variables, or localStorage.

---

## 9. Build & Distribution

### 9.1 Development

```bash
# Main process: TypeScript compiled via tsc
# Renderer: Vite + React + TypeScript
# IPC: Electron contextBridge for secure main ↔ renderer communication

npm run dev        # Starts both main and renderer in dev mode
npm run build      # Compiles both processes
npm run package    # electron-builder packages for current platform
```

### 9.2 Target Platforms

| Platform | Status | Notes |
|---|---|---|
| Windows | Primary | Most users; `desktopCapturer` well-supported |
| macOS | Secondary | Screen recording permission required (prompted on first capture) |
| Linux | Tertiary | X11 supported; Wayland has capture limitations |

---

## 10. Phase Boundaries

### Phase 1: Foundation
Deliver a working overlay that can capture screenshots, OCR them, store knowledge in SQLite, and answer questions about Canvas using the pre-built starter profile + Claude API. Passive learning runs but in a basic form (interval capture + dedup). This alone is a demo-able, resume-worthy project.

### Phase 2: Smart Passive Learning
Improve the capture engine with better change detection, URL-aware state tracking for web apps, and structured fact extraction. Add the Memory Panel for knowledge management. Add app auto-detection.

### Phase 3: Auto-Scan
Build the autonomous navigation engine for web apps. Add the pre-scan setup flow. This is the "let it learn Canvas overnight" feature.

### Phase 4: Expansion
Additional starter profiles (Overleaf, Avogadro). Model-agnostic LLM support. Desktop app scanning. Polish onboarding. Distribution packaging.
