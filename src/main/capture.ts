import { desktopCapturer, NativeImage } from "electron";
import { EventEmitter } from "events";
import sharp from "sharp";
import type {
  CaptureFrame,
  CaptureConfig,
  CaptureComparison,
} from "../shared/types";
import { CAPTURE } from "../shared/constants";

// --- Perceptual hashing ---

function computeDCT(matrix: number[], size: number): number[] {
  const dct = new Array<number>(size * size);
  const piOver2N = Math.PI / (2 * size);
  for (let u = 0; u < size; u++) {
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          sum +=
            matrix[x * size + y] *
            Math.cos((2 * x + 1) * u * piOver2N) *
            Math.cos((2 * y + 1) * v * piOver2N);
        }
      }
      dct[u * size + v] = sum;
    }
  }
  return dct;
}

async function computePHash(imageBuffer: Buffer): Promise<string> {
  const SIZE = 32;
  const HASH_SIZE = 8;

  const pixels = await sharp(imageBuffer)
    .resize(SIZE, SIZE, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  const pixelArray = Array.from(pixels);
  const dct = computeDCT(pixelArray, SIZE);

  // Extract top-left 8x8 block (low frequencies), skip DC coefficient
  const lowFreq: number[] = [];
  for (let u = 0; u < HASH_SIZE; u++) {
    for (let v = 0; v < HASH_SIZE; v++) {
      if (u === 0 && v === 0) continue;
      lowFreq.push(dct[u * SIZE + v]);
    }
  }

  const mean = lowFreq.reduce((a, b) => a + b, 0) / lowFreq.length;

  // Build 64-bit hash (63 bits from low-freq + 1 for DC)
  let hash = "";
  for (let u = 0; u < HASH_SIZE; u++) {
    let byte = 0;
    for (let v = 0; v < HASH_SIZE; v++) {
      const val = dct[u * SIZE + v];
      if (u === 0 && v === 0) {
        byte |= val > mean ? 1 << (7 - v) : 0;
      } else {
        byte |= val > mean ? 1 << (7 - v) : 0;
      }
    }
    hash += byte.toString(16).padStart(2, "0");
  }

  return hash;
}

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let distance = 0;
  for (let i = 0; i < a.length; i += 2) {
    const byteA = parseInt(a.substring(i, i + 2), 16);
    const byteB = parseInt(b.substring(i, i + 2), 16);
    let xor = byteA ^ byteB;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

function hashSimilarity(a: string, b: string): number {
  return 1 - hammingDistance(a, b) / 64;
}

// --- Capture engine ---

export class CaptureEngine extends EventEmitter {
  private config: CaptureConfig;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private lastHash: string | null = null;
  private lastCaptureTime = 0;
  private running = false;
  private paused = false;

  constructor(config?: Partial<CaptureConfig>) {
    super();
    this.config = {
      mode: config?.mode ?? "interval",
      intervalMs: config?.intervalMs ?? CAPTURE.DEFAULT_INTERVAL_MS,
      minIntervalMs: config?.minIntervalMs ?? CAPTURE.MIN_INTERVAL_MS,
      hashThreshold: config?.hashThreshold ?? CAPTURE.HASH_SIMILARITY_THRESHOLD,
      textDiffThreshold:
        config?.textDiffThreshold ?? CAPTURE.TEXT_DIFF_THRESHOLD,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;

    this.intervalTimer = setInterval(() => {
      if (!this.paused) {
        this.captureOnce().catch((err) => this.emit("error", err));
      }
    }, this.config.intervalMs);

    // Capture immediately on start
    this.captureOnce().catch((err) => this.emit("error", err));
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isRunning(): boolean {
    return this.running && !this.paused;
  }

  async captureOnce(): Promise<CaptureFrame | null> {
    const now = Date.now();
    if (now - this.lastCaptureTime < this.config.minIntervalMs) {
      return null;
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1080 },
      });

      if (sources.length === 0) {
        this.emit("error", new Error("No screen sources available"));
        return null;
      }

      const source = sources[0];
      const thumbnail: NativeImage = source.thumbnail;
      const imageBuffer = thumbnail.toPNG();

      if (imageBuffer.length === 0) {
        this.emit(
          "error",
          new Error(
            "Empty screenshot -- screen recording permission may be required"
          )
        );
        return null;
      }

      const pHash = await computePHash(imageBuffer);
      this.lastCaptureTime = now;

      if (this.lastHash) {
        const similarity = hashSimilarity(pHash, this.lastHash);
        if (similarity >= this.config.hashThreshold) {
          const comparison: CaptureComparison = {
            isNew: false,
            hashSimilarity: similarity,
            reason: "duplicate-hash",
          };
          this.emit("duplicate", comparison);
          return null;
        }
      }

      this.lastHash = pHash;

      const frame: CaptureFrame = {
        imageBuffer,
        pHash,
        timestamp: new Date().toISOString(),
        windowTitle: source.name || undefined,
      };

      this.emit("frame", frame);
      return frame;
    } catch (err) {
      this.emit("error", err);
      return null;
    }
  }

  resetHash(): void {
    this.lastHash = null;
  }
}
