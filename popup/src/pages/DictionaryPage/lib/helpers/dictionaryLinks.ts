export type DictionaryName = "Cambridge" | "Reverso Context" | "Multitran";

/** Links only; no scraping and no request until the viewer opens one. */
export function dictionaryLinks(text: string): { name: DictionaryName; url: string }[] {
  const query = text.trim().replace(/\s+/g, " ");
  if (!query) return [];
  const cambridge = encodeURIComponent(query.toLowerCase().replace(/\s+/g, "-"));
  const reverso = encodeURIComponent(query);
  const multitran = new URL("https://www.multitran.com/m.exe");
  multitran.searchParams.set("s", query);
  multitran.searchParams.set("l1", "1");
  multitran.searchParams.set("l2", "2");
  return [
    { name: "Cambridge", url: `https://dictionary.cambridge.org/us/dictionary/english-russian/${cambridge}` },
    { name: "Reverso Context", url: `https://context.reverso.net/translation/english-russian/${reverso}` },
    { name: "Multitran", url: multitran.toString() },
  ];
}
