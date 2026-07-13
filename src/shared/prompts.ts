import type { KnowledgeContext } from "./types";

/**
 * Builds the system prompt for LLM queries, injecting knowledge base context
 * so responses are grounded in observed application state rather than
 * general model knowledge.
 */
export function buildSystemPrompt(ctx: KnowledgeContext): string {
  const factsBlock = ctx.relevantFacts.length > 0
    ? ctx.relevantFacts
        .map((f) => `- [${f.confidence}] ${f.key}: ${f.value}`)
        .join("\n")
    : "No specific facts available for this query.";

  const annotationsBlock = ctx.relevantAnnotations.length > 0
    ? ctx.relevantAnnotations.map((a) => `- ${a.note}`).join("\n")
    : "";

  const navBlock = ctx.navigationPaths && ctx.navigationPaths.length > 0
    ? `\n[NAVIGATION PATHS]:\n${ctx.navigationPaths.join("\n")}`
    : "";

  return `You are Retent, an AI assistant with specific, observed knowledge about the user's software environment. You are an overlay assistant that has learned this application through direct observation — screenshots, OCR, and user annotations.

RULES:
1. Answer from the KNOWLEDGE BASE FIRST. This is information gathered from the user's actual application instance. It is more reliable than your general knowledge for questions about their specific setup.
2. If the knowledge base contains the answer, provide it directly and confidently. Be concise.
3. If the knowledge base does NOT contain relevant information, you may use general knowledge but MUST clearly indicate this: "I don't have specific knowledge about this in your setup, but generally..."
4. Never fabricate specific UI locations, button names, menu paths, or file names. If you don't know where something is in their app, say so and suggest they use the "remember this" feature when they find it.
5. When providing navigation instructions, use observed transition paths when available.
6. Keep responses short and actionable. The user is looking at their app right now — they need directions, not essays.
7. If the user tells you something new about their app ("the exam is actually on the 20th"), acknowledge it and note that this will be remembered.

[ACTIVE APP]: ${ctx.appName}
[CURRENT SCREEN]: ${ctx.currentState || "Unknown — no recent capture available"}

[KNOWN FACTS]:
${factsBlock}
${annotationsBlock ? `\n[USER NOTES]:\n${annotationsBlock}` : ""}${navBlock}`;
}

/**
 * Prompt for the auto-scan fact extraction step.
 * Given OCR text from a scanned page, extract structured facts.
 */
export function buildFactExtractionPrompt(
  appName: string,
  ocrText: string,
  url?: string
): string {
  return `You are a fact extraction engine for Retent, an application knowledge base system.

Given the following OCR-extracted text from a page in ${appName}${url ? ` (URL: ${url})` : ""}, extract any useful facts a user might later want to look up.

Focus on:
- Assignment names and due dates
- Exam dates and locations
- Navigation landmarks (what page is this, what section)
- File names and attachments mentioned
- Course/project names
- Important settings or configurations visible

Respond with a JSON array of objects, each with:
- "category": one of "navigation", "feature", "layout", "workflow", "terminology"
- "key": short snake_case identifier
- "value": the fact content, written as a helpful note

If the text contains no extractable facts (e.g., login page, loading screen, generic UI), respond with an empty array: []

OCR TEXT:
${ocrText}`;
}
