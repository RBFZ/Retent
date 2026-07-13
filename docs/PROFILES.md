# Retent — Starter Profiles

## What Are Starter Profiles?

Starter profiles are pre-built knowledge bases that ship with Retent. They provide immediate value for supported applications before passive learning personalizes the experience.

A starter profile contains:
- **URL and window title patterns** for automatic app detection
- **Facts** organized by category (navigation, feature, layout, workflow, terminology)
- **Common question mappings** that help the context assembler find relevant facts quickly

Starter profiles represent *general* knowledge about an application's standard layout. They don't know about the user's specific instance — that's what passive learning and active teaching add.

---

## Profile Format

Profiles are JSON files conforming to `schema.json`. See `canvas.json` for a complete example.

### Fact Categories

| Category | Use For |
|---|---|
| `navigation` | Where things are in the UI — menus, tabs, sidebars, pages |
| `feature` | What the app can do — submission types, notification settings, export options |
| `layout` | How the UI is structured — global nav vs course nav, panel positions |
| `workflow` | Step-by-step processes — how to submit, how to check grades |
| `terminology` | App-specific jargon — what "Modules" means in Canvas, what "Runs" means in a CI tool |

### Common Questions

The `commonQuestions` array maps natural language questions to relevant fact keys. This helps the context assembler prioritize which facts to inject into the LLM prompt when a user asks a question. Without this mapping, the assembler falls back to keyword matching against fact keys and values.

---

## Creating a New Profile

1. Create a new JSON file in `profiles/` following `schema.json`
2. Add URL patterns and/or window title patterns for app detection
3. Add facts covering the application's standard layout and common workflows
4. Add common question mappings
5. Register the profile in `src/shared/constants.ts` under `STARTER_PROFILES`

### Tips

- Write facts as if explaining to someone who has used the app briefly but can't remember where things are
- Focus on navigation and "where is X?" questions — those are the most common
- Include terminology explanations for app-specific jargon
- Don't over-specify — if the app has heavy professor/admin customization (like Canvas), note that in the facts
- Test by asking the common questions and checking if the assembled context would produce a good answer

---

## Profile Lifecycle

```
Starter Profile (ships with app)
        │
        ▼
  Loaded on first use when app is detected
        │
        ▼
  Passive learning adds personalized facts
  (user's specific classes, professor's layout, etc.)
        │
        ▼
  User annotations add explicit knowledge
  ("remember: exam dates are in Course Schedule page")
        │
        ▼
  Over time, observed + user-confirmed facts
  take priority over starter facts in context assembly
```

Starter facts have `confidence: "starter"`. Passively learned facts have `confidence: "observed"`. User annotations create facts with `confidence: "user-confirmed"`. When the context budget is tight, higher-confidence facts are prioritized.
