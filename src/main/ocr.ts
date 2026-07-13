import { createWorker, Worker } from "tesseract.js";
import sharp from "sharp";
import { CAPTURE } from "../shared/constants";

// --- Levenshtein distance ---

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function textSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// --- Text post-processing ---

function cleanOCRText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/^ +| +$/gm, "")
    .trim();
}

// --- OCR pipeline ---

export interface OCRResult {
  text: string;
  isNew: boolean;
  textSimilarity: number;
}

export class OCRPipeline {
  private worker: Worker | null = null;
  private lastText: string | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.worker = await createWorker("eng");
    this.initialized = true;
  }

  async processFrame(imageBuffer: Buffer): Promise<OCRResult> {
    if (!this.worker) {
      throw new Error("OCR pipeline not initialized. Call initialize() first.");
    }

    // Pre-process: greyscale + normalize contrast for better OCR
    const processed = await sharp(imageBuffer)
      .greyscale()
      .normalize()
      .png()
      .toBuffer();

    const { data } = await this.worker.recognize(processed);
    const text = cleanOCRText(data.text);

    if (text.length === 0) {
      return { text: "", isNew: false, textSimilarity: 1 };
    }

    if (this.lastText === null) {
      this.lastText = text;
      return { text, isNew: true, textSimilarity: 0 };
    }

    const similarity = textSimilarity(text, this.lastText);
    const isNew = similarity < 1 - CAPTURE.TEXT_DIFF_THRESHOLD;

    if (isNew) {
      this.lastText = text;
    }

    return { text, isNew, textSimilarity: similarity };
  }

  resetText(): void {
    this.lastText = null;
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}
