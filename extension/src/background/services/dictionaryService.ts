import { StorageService } from "../../common/services/storageService.ts";
import { TranslationData } from "../../common/types/translations.ts";

const KEY = "savedTranslations";
const identity = (entry: TranslationData) => [entry.originalText, entry.translatedText, entry.sourceLanguageCode, entry.targetLanguageCode]
  .map((part) => (part ?? "").trim().toLocaleLowerCase()).join("\u0000");

/** One writer across tabs/popup: preserves legacy records and serializes mutations. */
export class DictionaryService {
  constructor(private readonly storage = new StorageService()) {}

  public async save(entry: TranslationData): Promise<{ count: number; duplicate: boolean }> {
    let count = 0;
    let duplicate = false;
    await this.storage.update<TranslationData[]>(KEY, "local", (stored) => {
      const entries = stored ?? [];
      const existing = entries.find((item) => identity(item) === identity(entry));
      duplicate = Boolean(existing);
      if (existing) {
        // Never erase a note, timestamp, or earlier context on a duplicate click.
        for (const key of ["exampleOriginal", "exampleTranslation", "videoTitle", "videoUrl", "videoTimeSeconds"] as const) {
          if (existing[key] === undefined && entry[key] !== undefined) {
            Object.assign(existing, { [key]: entry[key] });
          }
        }
      } else {
        entries.unshift(entry);
      }
      count = entries.length;
      return entries;
    });
    return { count, duplicate };
  }

  /** Merge a user-selected backup as one atomic write; existing entries win. */
  public async import(entries: TranslationData[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    await this.storage.update<TranslationData[]>(KEY, "local", (stored) => {
      const existing = stored ?? [];
      const identities = new Set(existing.map(identity));
      const ids = new Set(existing.map((entry) => entry.id));
      for (const entry of entries) {
        const key = identity(entry);
        if (identities.has(key)) { skipped++; continue; }
        const id = ids.has(entry.id) ? crypto.randomUUID() : entry.id;
        existing.push({ ...entry, id });
        identities.add(key);
        ids.add(id);
        imported++;
      }
      return existing;
    });
    return { imported, skipped };
  }

  public async update(id: string, changes: Partial<TranslationData>): Promise<void> {
    await this.storage.update<TranslationData[]>(KEY, "local", (stored) => {
      const entries = stored ?? [];
      const entry = entries.find((item) => item.id === id);
      if (!entry) throw new Error("Dictionary entry not found");
      // Only editable fields; identity, timestamp and video metadata cannot be
      // accidentally replaced by a partial form or a stale popup.
      for (const key of ["originalText", "translatedText", "exampleOriginal", "exampleTranslation", "note"] as const) {
        if (typeof changes[key] === "string") entry[key] = changes[key];
      }
      return entries;
    });
  }

  public async remove(id: string): Promise<void> {
    await this.storage.update<TranslationData[]>(KEY, "local", (stored) => (stored ?? []).filter((entry) => entry.id !== id));
  }

  public async clear(): Promise<void> {
    await this.storage.update<TranslationData[]>(KEY, "local", () => []);
  }
}
