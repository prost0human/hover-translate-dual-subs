export interface Translation {
  id: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  translatedText: string;
  originalText: string;
  timestamp: number;
  exampleOriginal?: string;
  exampleTranslation?: string;
  videoTitle?: string;
  videoUrl?: string;
  videoTimeSeconds?: number;
  note?: string;
}