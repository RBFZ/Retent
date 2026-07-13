import Anthropic from "@anthropic-ai/sdk";
import Store from "electron-store";
import type { LLMEngine, KnowledgeContext, Message } from "../../shared/types";
import { LLM } from "../../shared/constants";
import { buildSystemPrompt } from "../../shared/prompts";

interface StoreSchema {
  apiKey: string;
}

export class ClaudeLLMEngine implements LLMEngine {
  private client: Anthropic | null = null;
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: "retent-config",
      encryptionKey: "retent-local-encryption",
    });
  }

  async ask(params: {
    question: string;
    knowledgeContext: KnowledgeContext;
    conversationHistory: Message[];
  }): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        "No API key configured. Please set your Anthropic API key in Settings."
      );
    }

    if (!this.client) {
      this.client = new Anthropic({ apiKey });
    }

    const systemPrompt = buildSystemPrompt(params.knowledgeContext);

    const recentHistory = params.conversationHistory.slice(
      -LLM.MAX_HISTORY_MESSAGES
    );

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...recentHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: params.question },
    ];

    try {
      const response = await this.client.messages.create({
        model: LLM.DEFAULT_MODEL,
        max_tokens: LLM.MAX_RESPONSE_TOKENS,
        system: systemPrompt,
        messages,
      });

      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return textBlocks.map((b) => b.text).join("");
    } catch (err: unknown) {
      if (err instanceof Anthropic.AuthenticationError) {
        this.client = null;
        throw new Error(
          "Invalid API key. Please check your Anthropic API key in Settings."
        );
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new Error(
          "Rate limit exceeded. Please wait a moment before trying again."
        );
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new Error(
          "Could not connect to Anthropic API. Check your internet connection."
        );
      }
      throw err;
    }
  }

  setApiKey(key: string): void {
    this.store.set("apiKey", key);
    this.client = null;
  }

  hasApiKey(): boolean {
    return Boolean(this.store.get("apiKey"));
  }

  private getApiKey(): string | undefined {
    return this.store.get("apiKey") || undefined;
  }
}
