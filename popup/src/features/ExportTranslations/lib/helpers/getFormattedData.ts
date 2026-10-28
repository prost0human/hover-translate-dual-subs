import { getFromStorage } from "@/shared/lib/helpers/storage.ts";
import { SavedTranslation, TranslationToExport } from "../../model/types/types.ts";
import dayjs from "dayjs";

const getDataToExport = async (): Promise<TranslationToExport[]> => {
  const savedTranslations = await getFromStorage<SavedTranslation[]>("savedTranslations", "local");

  if (!savedTranslations) {
    return [];
  }

  // Preserve the original export shape for legacy-only dictionaries; if any
  // record has context, include those columns for every row.
  const includeContext = savedTranslations.some((entry) =>
    [entry.exampleOriginal, entry.exampleTranslation, entry.videoTitle, entry.videoUrl, entry.videoTimeSeconds, entry.note].some((value) => value !== undefined));
  return savedTranslations.map((translation => {
    return {
      "Date": dayjs(translation.timestamp).format("DD/MM/YYYY HH:mm:ss"),
      "Translator": translation.translatorName,
      "Language": `${translation.sourceLanguageCode}-${translation.targetLanguageCode}`,
      "Original": translation.originalText,
      "Translation": translation.translatedText,
      "Transliteration": translation.transliteration || "",
      "Transcription": translation.transcription || "",
      "Dictionary": translation.dictionary || "",
      ...(includeContext ? {
        "Example": translation.exampleOriginal ?? "",
        "Example translation": translation.exampleTranslation ?? "",
        "Video title": translation.videoTitle ?? "",
        "Video URL": translation.videoUrl ?? "",
        "Video time (seconds)": translation.videoTimeSeconds?.toString() ?? "",
        "Note": translation.note ?? "",
      } : {}),
    };
  }));
};

export const getJSONToExport = async (): Promise<string> => {
  const data = await getDataToExport();
  return JSON.stringify(data, null, 2);
};

/**
 * Leading characters that turn a spreadsheet cell into a formula. The tab and
 * carriage return are on the list because spreadsheets skip them and read
 * whatever follows.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/** RFC 4180 quoting, plus the existing spreadsheet-formula protection. */
export const escapeCsvValue = (value: string | number | boolean | null | undefined, forceQuote = false): string => {
  if (value === null || value === undefined) return forceQuote ? "\"\"" : "";
  let text = value.toString();
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
  return forceQuote || /[,"\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
};

export const getCSVToExport = async (): Promise<string> => {
  const data = await getDataToExport();
  if (!data.length) return "";
  const headers = Object.keys(data[0]) as Array<keyof TranslationToExport>;
  const rows = data.map((item) => headers.map((header) => escapeCsvValue(item[header])).join(","));
  return `\uFEFF${[headers.join(","), ...rows].join("\n")}`;
};

/** Six plain-text fields, in the order most useful for mapping into Anki. */
export const getAnkiCSVToExport = async (): Promise<string> => {
  const entries = await getFromStorage<SavedTranslation[]>("savedTranslations", "local") ?? [];
  const rows = entries.map((entry) => {
    const fields = [
      entry.originalText, entry.translatedText, entry.exampleOriginal ?? "",
      entry.exampleTranslation ?? "", entry.videoUrl ?? "", entry.note ?? "",
    ];
    // A leading # must not be mistaken for an Anki comment/directive.
    return fields.map((value, index) => escapeCsvValue(value, index === 0)).join(",");
  });
  // Anki 2.1.54+ names columns with #columns. A plain CSV header would be
  // imported as an unwanted note. No BOM: # must be the first byte.
  return ["#separator:Comma", "#html:false", "#columns:English,Russian,Example,Example translation,Video URL,Note", ...rows].join("\n");
};
