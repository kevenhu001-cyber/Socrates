/**
 * ttsCache — bounded in-memory cache for synthesized speech audio
 * (LobeHub-alignment M4 follow-up: LobeHub persists a per-message TTS
 * result so replaying a message never re-bills the provider; Socrates
 * messages carry no TTS metadata column yet, so the cache lives at the
 * synthesis boundary keyed by the exact request, which fixes the same
 * cost problem transparently for the client).
 *
 * Key: SHA-256(userId + text + voice + format + lang) — per-user isolation, so
 * one user can never serve audio into another user's response, and the
 * same text in a different language never serves the wrong audio.
 *
 * Eviction: byte-budgeted (default 32 MB) LRU + per-entry TTL. The byte
 * budget matters because a 20 KB text can synthesize into megabytes of
 * MP3; counting entries alone would not bound memory.
 */

import { createHash } from 'node:crypto';

export interface TtsCacheEntry {
  audio: Buffer;
  contentType: string;
  createdAt: number;
}

export interface TtsCacheOptions {
  /** Total cached audio bytes (default 32 MB). */
  maxBytes?: number;
  /** Per-entry age limit in ms (default 30 min). */
  ttlMs?: number;
  /** Max simultaneous entries regardless of bytes (default 64). */
  maxEntries?: number;
  now?: () => number;
}

export function ttsCacheKey(userId: string, text: string, voice: string, format: string, lang: string = ''): string {
  return createHash('sha256').update(`${userId}\u0000${text}\u0000${voice}\u0000${format}\u0000${lang}`).digest('hex');
}

export class TtsCache {
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private entries: Map<string, TtsCacheEntry> = new Map();
  private bytes = 0;

  constructor(options: TtsCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 64;
    this.now = options.now ?? Date.now;
  }

  get(key: string): TtsCacheEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.now() - entry.createdAt > this.ttlMs) {
      this.delete(key);
      return null;
    }
    // LRU refresh: re-insert to move the key to the back of the Map.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(key: string, audio: Buffer, contentType: string): void {
    this.delete(key);
    const entry: TtsCacheEntry = { audio, contentType, createdAt: this.now() };
    this.entries.set(key, entry);
    this.bytes += audio.length;
    this.evict();
  }

  private delete(key: string): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.bytes -= existing.audio.length;
    this.entries.delete(key);
  }

  private evict(): void {
    // Oldest first — Map preserves insertion order.
    for (const [key, entry] of this.entries) {
      if (this.bytes <= this.maxBytes && this.entries.size <= this.maxEntries) break;
      if (this.now() - entry.createdAt > this.ttlMs || this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
        this.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Process-wide cache (one instance per process keeps repeats free). */
export const ttsCache = new TtsCache();
