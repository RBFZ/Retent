# Retent

An AI layer for software that will never get its own AI.

Every big platform is getting AI built in. VS Code has Copilot, Google Docs has Gemini, Excel has Claude. Most of the software people actually depend on will never get that treatment. Canvas, hospital EMR portals, Overleaf, university registration systems, QuickBooks, niche lab tools, government sites. They are too old, too small, or too specialized for anyone to bother.

Retent is a desktop overlay that sits on top of any application, learns the layout by watching you use it, and answers questions grounded in what it has actually seen rather than what a model guesses the app probably looks like. I started building it because half of my life as a student lives inside Canvas, and Canvas is never getting a real assistant.

## How it learns

There are three layers, and each builds on the previous one.

1. Starter profiles ship with the app. Open Retent over Canvas and it already knows where modules, grades, the calendar, and the inbox live, so you can ask questions immediately with zero setup. Profiles for Overleaf and Avogadro are planned next.
2. Passive learning runs while you navigate normally. Retent takes periodic screenshots, hashes them to skip duplicates, runs OCR on anything new, and saves meaningful screen states to a local database. Over time it builds a map of your specific instance: your instructor's odd module naming, the page where exam dates are actually posted, the custom fields in your company's tracker.
3. Active teaching lets you tell it things directly. Say "remember this" when you find a buried settings page, or tell it to forget last semester's classes. A planned auto scan mode will let it explore an app on its own and build out the knowledge base in one pass, strictly read only: it never submits forms, never downloads files, never types into inputs, never leaves the target application, and always shows a stop button.

## Under the hood

The capture pipeline works like this. Every few seconds the screen is captured and reduced to a perceptual hash. If the hash is at least 95% similar to the previous frame, the frame is thrown away before OCR ever runs, which keeps the loop cheap. Frames that survive go through Tesseract.js, and if the extracted text differs from the last stored state by less than 5% (Levenshtein) the frame is thrown away too. Whatever remains becomes a state node in SQLite, along with a transition edge from the previous state, so the knowledge base ends up as a graph of screens the app has actually been in.

When you ask a question, Retent scores the stored facts against your query (keyword overlap, weighted by how each fact was learned: user confirmed beats observed beats starter), packs the best ones into a 2000 token budget, and sends that context plus your question to the Claude API. The model is instructed to answer from the knowledge base first and to say so explicitly whenever it falls back to general knowledge, so you can tell the difference between "I watched you find this" and "apps like this usually work this way."

Screenshots never leave your machine. Only text that was extracted locally is ever sent anywhere.

## Stack

Electron for the shell, the overlay window, and screen capture. React with TypeScript for the UI, bundled by Vite. Tesseract.js for OCR so nothing depends on a server. SQLite for the knowledge store, sharp for image processing, and the Anthropic SDK for the LLM. The LLM sits behind a small interface so the model can be swapped out later.

## Project layout

```
src/
  main/        Electron main process: capture engine, OCR pipeline, SQLite knowledge store, Claude client
  renderer/    React UI: chat, status, and memory tabs
  shared/      types, constants, and prompts used by both processes
profiles/      prebuilt knowledge bases (Canvas ships first) plus their JSON schema
docs/          full architecture writeup and a guide to writing profiles
```

## Running it

```bash
npm install
npm run dev        # tsc watch + Vite dev server
npm run build      # production build
npm start          # launch Electron from the build
npm run typecheck
npm run lint
```

For hot reload, set `VITE_DEV_SERVER_URL=http://localhost:5173` before `npm start` so the window loads from Vite instead of the built files. One gotcha: the VS Code integrated terminal sets `ELECTRON_RUN_AS_NODE=1`, which quietly breaks Electron. The start script clears it, but if you launch Electron by hand you need to clear it yourself.

## Privacy

Everything is local by design. Screenshots, OCR text, and the knowledge base live in SQLite on your machine, and the only thing that ever crosses the network is the text context attached to your questions. No analytics, no telemetry. You can delete any fact, any note, or an entire app profile, and deletion is permanent. There is no soft delete and no hidden retention.

## Where it helps

A student can let it scan new Canvas classes at the start of a semester, then ask "where did the professor put the exam review" two weeks later and get an answer based on the actual course layout instead of a generic guess. A nurse in an EMR with thousands of screens can find the path to a procedure they only run once a month, because Retent watched them do it last time. A new hire on an undocumented internal CRM ends up with the documentation that never existed, built from their own onboarding.

## Status

Phase 1 is done: the overlay window, the capture and OCR pipeline with both layers of deduplication, the SQLite store, chat with knowledge context injection, and a Canvas starter profile. Fact extraction from captured states, automatic app detection, and auto scan come next. The full design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/PROFILES.md](docs/PROFILES.md) covers writing a starter profile for a new app.

## License

MIT
