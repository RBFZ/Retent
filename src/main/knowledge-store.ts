import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";
import fs from "fs";
import type {
  AppProfile,
  StateNode,
  Transition,
  Annotation,
  Fact,
  KnowledgeContext,
} from "../shared/types";
import { DB, LLM, STARTER_PROFILES } from "../shared/constants";

interface StarterProfileJson {
  appName: string;
  version: string;
  urlPatterns: string[];
  windowTitlePatterns?: string[];
  facts: Array<{
    category: string;
    key: string;
    value: string;
  }>;
  commonQuestions?: Array<{
    question: string;
    factKeys: string[];
  }>;
}

interface ProfileStats {
  stateCount: number;
  factCount: number;
  annotationCount: number;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    app_name TEXT NOT NULL,
    source TEXT CHECK(source IN ('starter', 'passive', 'active', 'auto-scan')),
    created_at TEXT NOT NULL,
    last_updated TEXT NOT NULL,
    settings TEXT
  );

  CREATE TABLE IF NOT EXISTS states (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    screenshot_path TEXT,
    ocr_text TEXT NOT NULL,
    url TEXT,
    window_title TEXT,
    phash TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    metadata TEXT,
    UNIQUE(profile_id, phash)
  );

  CREATE TABLE IF NOT EXISTS transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    from_state TEXT NOT NULL REFERENCES states(id),
    to_state TEXT NOT NULL REFERENCES states(id),
    action_description TEXT,
    click_x INTEGER,
    click_y INTEGER,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state_id TEXT NOT NULL REFERENCES states(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    state_id TEXT REFERENCES states(id) ON DELETE SET NULL,
    category TEXT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence TEXT CHECK(confidence IN ('starter', 'observed', 'user-confirmed')),
    timestamp TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_states_profile ON states(profile_id);
  CREATE INDEX IF NOT EXISTS idx_facts_profile ON facts(profile_id);
  CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
  CREATE INDEX IF NOT EXISTS idx_transitions_profile ON transitions(profile_id);
  CREATE INDEX IF NOT EXISTS idx_annotations_state ON annotations(state_id);
`;

const CONFIDENCE_PRIORITY: Record<string, number> = {
  "user-confirmed": 3,
  observed: 2,
  starter: 1,
};

export class KnowledgeStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ?? path.join(app.getPath("userData"), DB.FILENAME);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
  }

  // --- Profile management ---

  createProfile(profile: AppProfile): void {
    const stmt = this.db.prepare(`
      INSERT INTO profiles (id, app_name, source, created_at, last_updated, settings)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      profile.id,
      profile.appName,
      profile.source,
      profile.createdAt,
      profile.lastUpdated,
      profile.settings ? JSON.stringify(profile.settings) : null
    );
  }

  getProfile(id: string): AppProfile | undefined {
    const row = this.db
      .prepare("SELECT * FROM profiles WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToProfile(row);
  }

  listProfiles(): AppProfile[] {
    const rows = this.db
      .prepare("SELECT * FROM profiles ORDER BY app_name")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToProfile(r));
  }

  deleteProfile(id: string): void {
    this.db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
  }

  // --- State management ---

  insertState(state: StateNode): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO states
        (id, profile_id, screenshot_path, ocr_text, url, window_title, phash, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      state.id,
      state.profileId,
      state.screenshotPath ?? null,
      state.ocrText,
      state.url ?? null,
      state.windowTitle ?? null,
      state.pHash,
      state.timestamp,
      state.metadata ? JSON.stringify(state.metadata) : null
    );

    this.db
      .prepare("UPDATE profiles SET last_updated = ? WHERE id = ?")
      .run(state.timestamp, state.profileId);
  }

  getLatestState(profileId: string): StateNode | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM states WHERE profile_id = ? ORDER BY timestamp DESC LIMIT 1"
      )
      .get(profileId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToState(row);
  }

  getStateByHash(profileId: string, pHash: string): StateNode | undefined {
    const row = this.db
      .prepare("SELECT * FROM states WHERE profile_id = ? AND phash = ?")
      .get(profileId, pHash) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToState(row);
  }

  // --- Transition management ---

  insertTransition(transition: Omit<Transition, "id">): void {
    const stmt = this.db.prepare(`
      INSERT INTO transitions
        (profile_id, from_state, to_state, action_description, click_x, click_y, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      transition.profileId,
      transition.fromState,
      transition.toState,
      transition.actionDescription ?? null,
      transition.clickX ?? null,
      transition.clickY ?? null,
      transition.timestamp
    );
  }

  // --- Fact management ---

  insertFact(fact: Omit<Fact, "id">): void {
    const stmt = this.db.prepare(`
      INSERT INTO facts
        (profile_id, state_id, category, key, value, confidence, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      fact.profileId,
      fact.stateId ?? null,
      fact.category ?? null,
      fact.key,
      fact.value,
      fact.confidence,
      fact.timestamp
    );
  }

  getFactsByProfile(profileId: string): Fact[] {
    const rows = this.db
      .prepare("SELECT * FROM facts WHERE profile_id = ? ORDER BY category, key")
      .all(profileId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToFact(r));
  }

  deleteFact(id: number): void {
    this.db.prepare("DELETE FROM facts WHERE id = ?").run(id);
  }

  // --- Annotation management ---

  insertAnnotation(annotation: Omit<Annotation, "id">): void {
    const stmt = this.db.prepare(`
      INSERT INTO annotations (state_id, note, timestamp)
      VALUES (?, ?, ?)
    `);
    stmt.run(annotation.stateId, annotation.note, annotation.timestamp);
  }

  getAnnotationsByState(stateId: string): Annotation[] {
    const rows = this.db
      .prepare("SELECT * FROM annotations WHERE state_id = ? ORDER BY timestamp")
      .all(stateId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToAnnotation(r));
  }

  getAnnotationsByProfile(profileId: string): Annotation[] {
    const rows = this.db
      .prepare(
        `SELECT a.* FROM annotations a
         JOIN states s ON a.state_id = s.id
         WHERE s.profile_id = ?
         ORDER BY a.timestamp`
      )
      .all(profileId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToAnnotation(r));
  }

  deleteAnnotation(id: number): void {
    this.db.prepare("DELETE FROM annotations WHERE id = ?").run(id);
  }

  // --- Stats ---

  getProfileStats(profileId: string): ProfileStats {
    const stateCount = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM states WHERE profile_id = ?")
        .get(profileId) as { count: number }
    ).count;
    const factCount = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM facts WHERE profile_id = ?")
        .get(profileId) as { count: number }
    ).count;
    const annotationCount = (
      this.db
        .prepare(
          `SELECT COUNT(*) as count FROM annotations a
           JOIN states s ON a.state_id = s.id
           WHERE s.profile_id = ?`
        )
        .get(profileId) as { count: number }
    ).count;
    return { stateCount, factCount, annotationCount };
  }

  // --- Starter profile loading ---

  loadStarterProfile(
    profileDef: (typeof STARTER_PROFILES)[number],
    profilesDir: string
  ): void {
    const existing = this.getProfile(profileDef.id);
    if (existing) {
      console.log(`Starter profile "${profileDef.id}" already loaded, skipping.`);
      return;
    }

    const filePath = path.join(profilesDir, profileDef.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`Starter profile file not found: ${filePath}`);
      return;
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const data: StarterProfileJson = JSON.parse(raw);
    const now = new Date().toISOString();

    const profile: AppProfile = {
      id: profileDef.id,
      appName: data.appName,
      source: "starter",
      createdAt: now,
      lastUpdated: now,
      settings: {
        urlPatterns: data.urlPatterns,
        windowTitlePatterns: data.windowTitlePatterns,
      },
    };

    this.createProfile(profile);

    const insertFact = this.db.prepare(`
      INSERT INTO facts
        (profile_id, state_id, category, key, value, confidence, timestamp)
      VALUES (?, NULL, ?, ?, ?, 'starter', ?)
    `);

    const insertMany = this.db.transaction(
      (facts: StarterProfileJson["facts"]) => {
        for (const fact of facts) {
          insertFact.run(profileDef.id, fact.category, fact.key, fact.value, now);
        }
      }
    );

    insertMany(data.facts);
    console.log(
      `Loaded starter profile "${data.appName}" with ${data.facts.length} facts.`
    );
  }

  // --- Context assembly ---

  assembleContext(query: string, profileId: string): KnowledgeContext {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return {
        appName: "Unknown",
        currentState: "",
        relevantFacts: [],
        relevantAnnotations: [],
      };
    }

    const latestState = this.getLatestState(profileId);
    const currentState = latestState?.ocrText ?? "";

    const allFacts = this.getFactsByProfile(profileId);
    const scoredFacts = this.scoreFacts(allFacts, query);

    const budgetFacts = this.applyTokenBudget(scoredFacts);

    const annotations = latestState
      ? this.getAnnotationsByState(latestState.id)
      : [];

    return {
      appName: profile.appName,
      currentState,
      relevantFacts: budgetFacts,
      relevantAnnotations: annotations,
    };
  }

  // --- Cleanup ---

  close(): void {
    this.db.close();
  }

  // --- Private helpers ---

  private scoreFacts(
    facts: Fact[],
    query: string
  ): Fact[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return facts;

    const scored = facts.map((fact) => {
      const factText = `${fact.key} ${fact.value}`.toLowerCase();
      let relevanceScore = 0;
      for (const token of queryTokens) {
        if (factText.includes(token)) {
          relevanceScore += 1;
        }
      }
      const confidenceScore = CONFIDENCE_PRIORITY[fact.confidence] ?? 0;
      return { fact, score: relevanceScore * 10 + confidenceScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored
      .filter((s) => s.score > 0)
      .map((s) => s.fact);
  }

  private applyTokenBudget(facts: Fact[]): Fact[] {
    const budget = LLM.CONTEXT_BUDGET_TOKENS;
    let estimatedTokens = 0;
    const result: Fact[] = [];

    for (const fact of facts) {
      const factText = `[${fact.confidence}] ${fact.key}: ${fact.value}`;
      const tokenEstimate = Math.ceil(factText.split(/\s+/).length * 1.3);
      if (estimatedTokens + tokenEstimate > budget) break;
      estimatedTokens += tokenEstimate;
      result.push(fact);
    }

    return result;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private rowToProfile(row: Record<string, unknown>): AppProfile {
    return {
      id: row.id as string,
      appName: row.app_name as string,
      source: row.source as AppProfile["source"],
      createdAt: row.created_at as string,
      lastUpdated: row.last_updated as string,
      settings: row.settings ? JSON.parse(row.settings as string) : undefined,
    };
  }

  private rowToState(row: Record<string, unknown>): StateNode {
    return {
      id: row.id as string,
      profileId: row.profile_id as string,
      screenshotPath: (row.screenshot_path as string) ?? undefined,
      ocrText: row.ocr_text as string,
      url: (row.url as string) ?? undefined,
      windowTitle: (row.window_title as string) ?? undefined,
      pHash: row.phash as string,
      timestamp: row.timestamp as string,
      metadata: row.metadata
        ? JSON.parse(row.metadata as string)
        : undefined,
    };
  }

  private rowToFact(row: Record<string, unknown>): Fact {
    return {
      id: row.id as number,
      profileId: row.profile_id as string,
      stateId: (row.state_id as string) ?? undefined,
      category: (row.category as string) ?? undefined,
      key: row.key as string,
      value: row.value as string,
      confidence: row.confidence as Fact["confidence"],
      timestamp: row.timestamp as string,
    };
  }

  private rowToAnnotation(row: Record<string, unknown>): Annotation {
    return {
      id: row.id as number,
      stateId: row.state_id as string,
      note: row.note as string,
      timestamp: row.timestamp as string,
    };
  }
}
