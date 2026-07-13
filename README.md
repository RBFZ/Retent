# Retent

**The AI layer for software that will never get its own AI.**

Retent is a desktop overlay assistant that learns application layouts through passive observation and guided teaching, building per-app knowledge bases that ground LLM responses in actual UI context rather than general knowledge.

Every major platform is racing to embed AI — VS Code has Copilot, Google Docs has Gemini, Excel has Claude. But 90% of the software people use daily will never get a native AI assistant. Canvas LMS, Avogadro, hospital EMR portals, Overleaf, university registration systems, QuickBooks, niche lab tools, government portals — these tools are too small, too old, or too niche for anyone to build AI into.

Retent is the assistant for everything that got left behind.

---

## How It Works

Retent operates as a lightweight desktop overlay that sits on top of any application. It learns how your software works through three progressive layers — each building on the last, none requiring effort from the user to start getting value.

### Layer 1: Instant Value (Zero Setup)
For supported applications, Retent ships with **starter profiles** — pre-built knowledge bases that map common UI layouts. Open Retent over Canvas, and it already knows where the calendar lives, where modules are, where grades and the inbox sit. You can ask questions immediately.

### Layer 2: Passive Learning (Background)
As you navigate naturally, Retent watches (with permission). It captures screenshots on meaningful state changes, runs OCR, and builds a personalized map of *your* specific instance. Your professor's weird module naming, where your specific exam dates are hidden, the custom fields in your company's Jira — Retent learns all of it without you doing anything deliberate.

### Layer 3: Active Teaching (Power User)
Tell Retent to remember specific things, forget outdated information, or run a guided walkthrough where it autonomously navigates an application to build a comprehensive knowledge base. Start a new semester? Tell it to forget last semester's classes. Found a hidden settings page? Say "remember this." Full control over what it knows.

---

## Autonomous Navigation (Auto-Scan)

For supported applications, Retent can perform a guided self-exploration:

1. **Pre-scan setup** — Retent asks the user scoping questions before starting:
   - "Which classes should I scan?" (avoids scanning outdated/unpublished courses)
   - "Should I open file attachments or just note their names?"
   - "Any areas I should skip?"
2. **Rule-bounded navigation** — Retent clicks through UI elements methodically (tabs, modules, assignment lists) but follows strict safety rules:
   - Never downloads files — only previews/views in-browser
   - Never submits forms or modifies data
   - Never navigates away from the target application
   - Always has a visible "Stop" control the user can hit
3. **State capture** — At each meaningful screen, it captures a screenshot, runs OCR, extracts text content, and logs the navigation path that led there
4. **Knowledge assembly** — After the scan completes, Retent compiles findings into a structured knowledge base and presents a summary: "I found 5 classes, 47 assignments, 12 files, and 3 exam dates. Here's what I learned."

This can run in the background while the user does other things — no babysitting required.

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

### Core Components

```
┌─────────────────────────────────────────────────────┐
│                   Retent Overlay                    │
│              (Electron BrowserWindow)               │
│                                                     │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ Chat UI │  │ Status   │  │ Memory Panel        │ │
│  │         │  │ Indicator│  │ (view/edit/forget)  │ │
│  └─────────┘  └──────────┘  └─────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────────┐
          │            │                │
   ┌──────▼──────┐ ┌──▼──────────┐ ┌───▼────────────┐
   │  Capture    │ │  Knowledge  │ │  LLM Engine    │
   │  Engine     │ │  Store      │ │                │
   │             │ │             │ │  Claude API    │
   │ Screenshots │ │ SQLite DB   │ │  (modular for  │
   │ OCR/Text    │ │ Per-app     │ │   future swap) │
   │ Change Det. │ │ profiles    │ │                │
   └─────────────┘ └─────────────┘ └────────────────┘
```

### Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Desktop Shell | Electron | Cross-platform, system-level screenshot access via `desktopCapturer`, overlay window support |
| Frontend | React + TypeScript | Component-based UI, type safety |
| OCR | Tesseract.js | Client-side, no API dependency, runs offline |
| Change Detection | Perceptual hashing (pHash) + OCR text diff | Two-layer dedup: fast image hash first, then text comparison for borderline cases |
| Knowledge Store | SQLite (via `better-sqlite3`) | Local-first, no server dependency, per-app profiles as separate tables |
| LLM Integration | Anthropic Claude API (TypeScript SDK) | Primary model; architecture supports future model swapping |
| Auto-Navigation | Electron `webContents` / system-level input simulation | For autonomous scan mode on web-based apps |

---

## Starter Profiles

Retent ships with pre-built knowledge bases for initial supported applications:

| Application | Profile Scope | Status |
|---|---|---|
| **Canvas LMS** | General layout — dashboard, modules, calendar, grades, inbox, assignments, syllabus tabs | Primary demo |
| **Overleaf** | Editor layout, compilation, project structure, common LaTeX commands in context | Planned |
| **Avogadro2** | Menu structure, tool panels, plugin locations, common workflows | Planned |

Starter profiles provide the general layout of an application. Passive learning personalizes them to *your specific instance* — your classes, your projects, your configuration.

---

## Project Structure

```
retent/
├── README.md
├── package.json
├── tsconfig.json
├── electron-builder.yml
│
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, window management
│   │   ├── overlay.ts           # Overlay window creation and positioning
│   │   ├── capture.ts           # Screenshot capture engine
│   │   ├── ocr.ts               # Tesseract.js OCR pipeline
│   │   ├── change-detection.ts  # pHash + text diff deduplication
│   │   ├── knowledge-store.ts   # SQLite operations, profile management
│   │   ├── auto-scan.ts         # Autonomous navigation engine
│   │   └── llm/
│   │       ├── engine.ts        # LLM interface (model-agnostic)
│   │       └── claude.ts        # Claude API implementation
│   │
│   ├── renderer/                # Electron renderer (React UI)
│   │   ├── App.tsx              # Root component
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx    # Main Q&A interface
│   │   │   ├── StatusBar.tsx    # Learning indicator, app detection
│   │   │   ├── MemoryPanel.tsx  # View/edit/forget knowledge
│   │   │   ├── ScanSetup.tsx    # Pre-scan question flow
│   │   │   └── OnboardingFlow.tsx # First-run app selection
│   │   ├── hooks/
│   │   │   ├── useKnowledge.ts  # Knowledge store React bindings
│   │   │   └── useCapture.ts    # Capture state management
│   │   └── styles/
│   │       └── overlay.css      # Minimal, always-on-top styling
│   │
│   └── shared/                  # Shared types and utilities
│       ├── types.ts             # Core type definitions
│       ├── constants.ts         # Config constants
│       └── prompts.ts           # System prompts for LLM context injection
│
├── profiles/                    # Starter knowledge base profiles
│   ├── canvas.json              # Pre-built Canvas LMS profile
│   └── schema.json              # Profile format specification
│
├── docs/
│   ├── ARCHITECTURE.md          # Detailed system architecture
│   └── PROFILES.md              # How to create/extend profiles
│
└── assets/
    └── icon.png                 # App icon
```

---

## Knowledge Base Schema

Each application profile stores knowledge as a graph of **states** connected by **transitions**:

```typescript
interface AppProfile {
  appName: string;
  createdAt: string;
  lastUpdated: string;
  source: "starter" | "passive" | "active" | "auto-scan";
  states: StateNode[];
  transitions: Transition[];
  userAnnotations: Annotation[];
}

interface StateNode {
  id: string;
  screenshot?: string;          // Path to stored screenshot
  ocrText: string;              // Extracted text content
  url?: string;                 // For web apps, the current URL
  windowTitle?: string;         // OS-level window title
  timestamp: string;
  pHash: string;                // Perceptual hash for dedup
  metadata: Record<string, string>; // Extracted structured data
}

interface Transition {
  fromState: string;
  toState: string;
  action: string;               // "clicked Modules tab", "scrolled down"
  coordinates?: { x: number; y: number };
}

interface Annotation {
  stateId: string;
  note: string;                 // User's description: "exam dates are here"
  timestamp: string;
}
```

---

## LLM Context Injection

When the user asks a question, Retent does **not** just pass the question to the LLM. It constructs a grounded prompt:

```
System: You are Retent, an AI assistant with specific knowledge about 
the user's software environment. Answer questions using the provided 
knowledge base FIRST. Only fall back to general knowledge when the 
knowledge base doesn't contain relevant information, and clearly 
indicate when you're doing so.

[ACTIVE APP]: Canvas LMS
[CURRENT STATE]: Modules page for HIST 1301 - US History to 1877

[KNOWLEDGE BASE CONTEXT]:
- This class has 12 modules, organized by week
- Exam 1 review is in Module 4 (not in syllabus)
- Exam dates: Midterm Mar 6, Final May 8 (found in "Course Schedule" 
  page, not in syllabus or calendar)
- Professor posts lecture slides as PDF attachments in each module
- Assignments are due Sundays at 11:59 PM

[USER ANNOTATIONS]:
- "exam dates are hidden in Course Schedule page" (tagged Feb 12)

User: Where can I find my exam dates?
```

The LLM receives the question *plus* the relevant knowledge context. This is what makes Retent's answers grounded rather than generic.

---

## Change Detection Pipeline

The two-layer deduplication system prevents knowledge base bloat:

```
New Screenshot Captured
        │
        ▼
┌─────────────────┐
│  Perceptual Hash │ ──── Hash similarity > 95%? ──── YES ──→ DISCARD
│  (fast, cheap)   │                                          (identical frame)
└────────┬────────┘
         │ NO (potentially different)
         ▼
┌─────────────────┐
│  Run OCR         │
│  Compare text to │ ──── Text identical? ──── YES ──→ DISCARD
│  last stored     │                                   (visual change but
│  state's text    │                                    same content)
└────────┬────────┘
         │ NO (meaningful change)
         ▼
┌─────────────────┐
│  STORE as new    │
│  StateNode       │
│  Log transition  │
└─────────────────┘
```

---

## Security & Privacy

Retent is local-first by design:

- **All data stays on your machine.** Screenshots, OCR text, and knowledge bases are stored in local SQLite. Nothing is uploaded to any server except LLM API calls.
- **LLM API calls send text only.** Screenshots are OCR'd locally; only extracted text is sent to the LLM for context. Raw screenshots never leave your device.
- **Auto-scan safety rules:**
  - Read-only navigation — never submits forms, never modifies data, never downloads files
  - User-defined scope — you choose which areas to scan before it starts
  - Visible stop control — always one click to halt
  - Activity log — every action the auto-scan takes is logged and reviewable
- **Forget functionality:** Users can delete any knowledge node, annotation, or entire app profile. Deletion is permanent — no soft-delete, no hidden retention.
- **No analytics, no telemetry.** Retent does not phone home.

---

## Auto-Scan Safety Rules

The autonomous navigation feature follows strict constraints:

```typescript
interface ScanRules {
  // What the scanner CAN do
  allowed: [
    "click navigation tabs",
    "click links within the target app",
    "scroll pages",
    "open/preview file attachments in-browser",
    "expand collapsible sections",
    "switch between views (list/grid/calendar)"
  ];

  // What the scanner CANNOT do
  forbidden: [
    "download any files",
    "submit any forms",
    "modify any data (edit, delete, post)",
    "navigate away from the target application",
    "enter text into any input field",
    "authenticate or log in",
    "access other browser tabs or applications",
    "interact with third-party embedded content"
  ];

  // User-configurable scope
  userScoping: {
    include: string[];    // "Only scan these classes"
    exclude: string[];    // "Skip archived courses"
    depth: "shallow" | "standard" | "deep";
    openAttachments: boolean;
    maxDuration: number;  // Minutes before auto-stop
  };
}
```

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run package
```

---

## Roadmap

### Phase 1 — Foundation (Current)
- [ ] Electron shell with overlay window
- [ ] Screenshot capture on click/navigation events
- [ ] Tesseract.js OCR pipeline
- [ ] Perceptual hash change detection
- [ ] SQLite knowledge store
- [ ] Basic chat UI with Claude API integration
- [ ] Canvas LMS starter profile

### Phase 2 — Passive Learning
- [ ] Background observation with permission toggle
- [ ] State graph construction from passive captures
- [ ] Automatic app detection (window title / URL matching)
- [ ] Knowledge base viewer/editor in Memory Panel

### Phase 3 — Auto-Scan
- [ ] Pre-scan setup question flow
- [ ] Read-only autonomous navigation engine
- [ ] Scan progress UI with stop control
- [ ] Post-scan knowledge summary

### Phase 4 — Polish & Profiles
- [ ] Overleaf starter profile
- [ ] Avogadro starter profile
- [ ] Memory management (forget, update, archive semesters)
- [ ] Onboarding flow refinement
- [ ] Packaging and distribution

---

## Use Cases

**College student on Canvas** — Start of semester, open Retent, let it auto-scan your new classes. Two weeks later, ask "where did my professor put the exam review?" and get an answer grounded in your actual Canvas layout, not a generic guess.

**Researcher using Avogadro** — Complex molecular viewer with dozens of menus and plugins. Retent learns your workflow — which tools you use, where your custom plugins live, how you export data — and becomes a contextual reference that beats searching documentation.

**Overleaf user who doesn't know LaTeX** — Instead of paying for Overleaf's built-in AI or learning LaTeX syntax, Retent watches how the editor works, learns common commands in context, and helps you format your paper without leaving the editor.

**Nurse navigating an EMR** — Hospital systems like Epic have thousands of screens. You do a specific procedure once a month and can never remember the path. Retent remembers, because it watched you do it last time.

**New hire onboarding to internal tools** — Your company uses a custom CRM nobody documented. Retent learns it as you learn it, then becomes the documentation that never existed.

---

## License

MIT
