import { TranslationData } from "@extension/common/types/translations.ts";

/** The original HoverTranslate JSON export uses DD/MM/YYYY HH:mm:ss. */
function parseDate(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parts = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (parts) return new Date(+parts[3], +parts[2] - 1, +parts[1], +parts[4], +parts[5], +parts[6]).getTime();
  }
  return Date.now();
}

/** Validate the whole file before touching storage; supports old formatted JSON exports. */
export function parseDictionaryBackup(json: string): TranslationData[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw) || raw.length > 10_000) throw new Error("Expected an array of up to 10,000 entries");
  return raw.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid dictionary entry");
    const row = item as Record<string, unknown>;
    const text = (name: string, oldName: string) => {
      const value = row[name] ?? row[oldName];
      return typeof value === "string" ? value : "";
    };
    const originalText = text("originalText", "Original");
    const translatedText = text("translatedText", "Translation");
    if (!originalText.trim() || !translatedText.trim()) throw new Error("An entry has no word or translation");
    const pair = text("language", "Language");
    const [source = "auto", ...target] = pair.split("-");
    const seconds = row.videoTimeSeconds ?? row["Video time (seconds)"];
    return {
      id: typeof row.id === "string" && row.id ? row.id : crypto.randomUUID(),
      originalText, translatedText,
      sourceLanguageCode: text("sourceLanguageCode", "Source language") || source || "auto",
      targetLanguageCode: text("targetLanguageCode", "Target language") || target.join("-") || "ru",
      translatorName: text("translatorName", "Translator") || "Unknown",
      timestamp: parseDate(row.timestamp ?? row.Date),
      dictionary: text("dictionary", "Dictionary"),
      transliteration: text("transliteration", "Transliteration"),
      transcription: text("transcription", "Transcription"),
      exampleOriginal: text("exampleOriginal", "Example"),
      exampleTranslation: text("exampleTranslation", "Example translation"),
      videoTitle: text("videoTitle", "Video title"),
      videoUrl: text("videoUrl", "Video URL"),
      ...(seconds !== undefined && seconds !== "" && Number.isFinite(Number(seconds)) ? { videoTimeSeconds: Number(seconds) } : {}),
      note: text("note", "Note"),
    };
  });
}
