# HoverTranslate Dual Subs

[Русская версия](README.ru.md) · [Build details](BUILD_INSTRUCTIONS.md) · [Contributing](CONTRIBUTING.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

An **independent fork** of [HoverTranslate](https://github.com/kozii-d/hover-translate) by Dmytro Kozii (MIT). It retains the original hover translator and adds an opt-in English → Russian subtitle line, contextual vocabulary, and Anki export for learning English on YouTube. This is **not** the upstream Chrome Web Store extension or an official release. Report fork-specific problems in [this fork's issues](https://github.com/prost0human/hover-translate-dual-subs/issues), not upstream.

For attribution and migration only, the **original**, unmodified extension's listings are [Chrome Web Store](https://chromewebstore.google.com/detail/jbddomeagbjjdoaehkdffdhifdhnmfic), [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/hovertranslate/) and [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/emnbmkhbohfjmbkdipkppnbdlhgnhmhm). These links do **not** install this fork or its dual-subtitle features.

## What it does

- Keeps YouTube's English captions and existing word hover, Shift multi-word selection, click action, auto-pause, translator choices, appearance controls and local dictionary. The non-interactive Russian line can be placed **above the captions** or at the **top of the video**.
- Translates growing automatic captions in throttled fragments, keeps a relevant previous translation visible while the next one loads, reuses the bounded cache and discards obsolete replies. Subtitle translation uses the selected translator with an explicit `en → ru` pair. Word translations still use the original language settings.
- Highlights a Russian translation on English hover/selection **approximately**: a unique literal or conservative inflection match for the selected text's translation is used; otherwise the entire Russian sentence is highlighted. It is not a word-alignment model, and even a literal match can be linguistically wrong. No unsupported positional equivalence is asserted.
- Saves the selected word/phrase with available source sentence, Russian sentence, video title, timestamped YouTube link and a user note. Old dictionary records remain readable; edit text, examples and notes in Dictionary. Repeated identical entries are merged without replacing an existing note or context.
- Opens Cambridge English–Russian, Reverso Context and Multitran **links** for a saved expression; no dictionary scraping. Export an Anki CSV or the existing JSON/CSV formats, and import a JSON backup from the original extension.
- Has English and Russian UI strings; newly added strings in other supported languages fall back to English. No account or paid API is required for the default Google translator. DeepL requires your own key; Bing and DeepL request their existing optional permissions.

## Install or update from the archive

Download the **Chromium production ZIP** from the fork's [Releases](https://github.com/prost0human/hover-translate-dual-subs/releases), not GitHub's source-code ZIP. Extract it, open `chrome://extensions` (or the equivalent in Edge/Brave), enable Developer mode, select **Load unpacked**, and choose the extracted folder containing `manifest.json`.

To update an existing unpacked copy, first export a JSON backup of the dictionary. Extract the new ZIP to a temporary folder and copy its contents over the **same installed folder**; replace existing files, keep the folder path unchanged, click **Reload** on the extension page, then reload YouTube. Changing the installed folder can create a new extension ID with separate storage. The extension does not automatically migrate data between IDs.

## Install from source (Chrome, Edge, Brave)

Prerequisites: Node.js **24.12.0+**, npm **11.6.2+**, and Linux/macOS or WSL (the scripts use `cp`/`rm`). `npm ci` uses the three checked-in lockfiles.

```bash
npm ci
npm ci --prefix extension
npm ci --prefix popup
npm run setup:chrome          # Edge may also use npm run setup:edge
npm run build
```

Open `chrome://extensions`, `edge://extensions`, or `brave://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the **repository root** (the folder containing generated `manifest.json`), not `extension/dist`. Pin the extension if desired, and reload YouTube tabs already open. You can keep the original installed, but temporarily disable it on YouTube to prevent both copies modifying the same captions. Rebuild and press the extension's Reload button after source changes.

The unpacked Chrome manifest deliberately contains **no upstream public key**. Chromium assigns a fork-specific ID, normally tied to its installed path; moving/reinstalling may give a different ID and separate storage. Back up the dictionary before moving it. For a production store release, establish the fork's own signing identity, review the inherited store listing/site, privacy policy and permissions, and publish separately. The source-archive script includes tracked files only, so commit newly added sources before generating a release source archive. The inherited Firefox manifest now has a different fork ID to avoid impersonating upstream; Firefox is **not tested or claimed supported** by this fork. The inherited upstream GitHub Pages deployment is disabled for forks until its site is replaced.

### Migrate an existing HoverTranslate dictionary

A different extension ID means the browser does **not** share or automatically migrate storage, settings, cache or API keys. Do not uninstall the old copy until you have verified the new one:

1. In the **old** extension open **Dictionary → Export JSON**, and keep the file as a backup.
2. Build/load this fork, open **Dictionary → Import JSON backup**, and choose the file. Confirm the imported/duplicate counts and inspect a few words.
3. Re-enter settings and any optional translator credentials. The backup contains dictionary entries only; old exports cannot supply sentence/video metadata that was never saved.

The importer accepts the original formatted JSON array and this fork's JSON export, up to **5 MB / 10,000 entries** per file. Each record must have a non-empty original and translation; validation happens before a single serialized merge. Duplicates (same original, translation and language pair, case-insensitive) are skipped and existing entries win. Conflicting IDs are replaced. Formatted legacy dates are interpreted in the local timezone with second precision; unrecognized dates use the import time. JSON is not a complete profile backup. The fork keeps using the original `savedTranslations` local storage key, with optional new fields, when upgrading a copy *with the same ID*.

## Use on YouTube

1. Open a video, turn on **CC**, and select an **English** subtitle track in the player. The feature reads visible caption DOM, not YouTube's transcript API. It uses a script heuristic, not reliable language detection; manually select English.
2. Extension → **Settings**: set **Translate to → Russian** for word/phrase lookups. Enable **Dual subtitles (English → Russian)**. Under **Russian subtitle position**, choose **Above the English captions** or **Top of the video**; adjust font size, opacity, background and distance. The Russian line and cross-highlight can be switched independently. Enable **Auto pause** if desired.
3. Hover a word. Hold **Shift** and move across adjacent English words to select a phrase (or use the existing always-multiple-selection option). The Russian overlay doesn't intercept pointer events. With the default click action, click the selection to save it. Move the pointer away to resume **only** a video the extension itself paused; a video already paused by you is not resumed. Pressing pause while the extension has already paused the video is not always distinguishable from no action.
4. In **Dictionary**, expand/edit a record to inspect or correct the word, translation, examples and note. Use its video link or external-dictionary menu. If the sentence translation wasn't ready when you saved, its field may be empty; you can edit it.

Automatic captions are translated progressively rather than word-for-word: the first fragment is requested shortly after it appears, and growing lines are updated at most about once every 0.8 seconds per caption window. Network and translator latency mean the Russian may lag or change wording; while a line rolls up, the previous overlapping translation may remain briefly. It is removed when its English disappears or the line changes to an unrelated one. Some layouts, live/embedded players or YouTube DOM changes may need adjustment. A translator can fail or rate-limit. **Visible fragments and lines are sent to the selected provider**, in addition to hovered selections; progressive mode can use more requests and paid API quota than waiting for a complete line. Disable dual subtitles to stop these requests. See Privacy below.

## Export to Anki

1. Open **Dictionary → Export Anki CSV**. The UTF-8 comma-separated file has six columns in this order: **English**, **Russian**, **Example**, **Example translation**, **Video URL**, **Note**. Values are escaped and quoted as needed; potentially executable spreadsheet-formula prefixes are prefixed with an apostrophe. Other CSV/JSON export actions remain available.
2. In desktop Anki, create a deck and a custom note type with matching six fields if you want all context (the built-in Basic type only has Front/Back). Use **File → Import**, select the CSV, set **Comma** if needed, choose the deck/note type and map the six fields. For Basic, map only the first two; the rest will not be retained.
3. The file begins with Anki's `#separator`, `#html:false`, and `#columns` directives, so a column-header row isn't imported as a card in supported versions (Anki **2.1.54+**). Review the preview and duplicate/update behavior before importing, then check both sides and the video URL. See the [Anki text import manual](https://docs.ankiweb.net/importing/text-files.html). No AnkiConnect integration is required or implemented.

A sample produced by the exporter was imported into an isolated collection using the Anki 26.9.3 engine: two notes, six fields, Cyrillic, quotes, a multiline field and a `#`-prefixed word were verified. The desktop Anki UI has not been manually tested. Verify with a small sample and back up your collection before a large import. The Anki-specific directives are comments rather than ordinary CSV rows; some spreadsheet tools may show them as rows.

## Manual acceptance checklist

Run on a real Chromium-based browser with a real English-captioned YouTube video; this is not a substitute for automated fixtures:

- [ ] In Settings select Russian, enable dual subtitles and auto-pause; turn on English CC. Try both Russian positions, resize/fullscreen, seek and switch videos; confirm readability, interactive English and no duplicate Russian line. Try disabling each new toggle and re-enabling it; native hover/Shift must still work.
- [ ] Find or create a caption containing **“back down”**. Hover **back**, hold Shift through **down**, inspect the translation and approximate Russian highlight. Click to save, then move away: a playing video resumes; a manually paused one stays paused.
- [ ] Repeat with **“look forward to”**. Check multi-word translation, fallback highlighting if there is no unambiguous match, and persistence after a reload.
- [ ] In Dictionary inspect/edit both entries and their sentence, video timestamp/link and note. Open all three external dictionary links and verify searches, including phrases.
- [ ] Export JSON, then Anki CSV; inspect quotes, multiline text and Cyrillic. Import the CSV into a test Anki deck using the six-field mapping above; check the resulting cards and video links. Test old-extension JSON migration separately before removing the old copy.
- [ ] Try a changing auto-generated caption, translator outage/rate limit, fast seeking, fullscreen and return to normal. Confirm stale translations don't replace the current line and manual pause is respected.

## Privacy and permissions

Your dictionary and cached translations stay in the browser's extension storage unless you explicitly export them. No account or analytics are added by this fork; no dictionary is uploaded or scraped. Google, Bing or DeepL receive text for translations; with dual mode on, this includes visible full lines, and the provider can observe normal request metadata. DeepL API keys remain in local extension storage. Clicking an external dictionary link sends the expression to that site in your browser. Existing optional host access for Bing/DeepL is requested only when selected; the fork adds no permissions. The inherited uninstall-survey URL is cleared rather than directing fork users to upstream's survey.

## Development and checks

```bash
npm run lint
npm run typecheck
npm test                          # scripts + extension + popup unit/integration
npm run setup:chrome && npm run build
npx playwright install chromium  # on Linux CI: add --with-deps
npm run test:e2e                  # installed extension on local mock YouTube + mock translators
# Optional: content bundle only, with a simulated Chrome API (not extension E2E):
HT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-smoke.js
```

The existing [CI workflow](.github/workflows/ci.yml) installs Chromium and runs these checks. E2E tests need a **full Chromium** capable of loading MV3 extensions, not Chromium headless shell. In the current sandbox the browser download was blocked and full extension E2E did not run; the production content bundle was separately smoke-tested in headless Chromium with mocked Chrome APIs. Real YouTube, the desktop Anki UI and the new Firefox identity still require manual verification. Tests and fixture outcomes do not guarantee compatibility with future YouTube DOM changes.

## License and credits

[MIT](LICENSE), Copyright © 2025 Dmytro Kozii. Original source: [kozii-d/hover-translate](https://github.com/kozii-d/hover-translate). This fork adds the features described above and keeps the original license and attribution. The upstream project credits [MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator), [XTranslate](https://github.com/ixrock/xt) and the open-source translation services; retained thanks. Dependency licenses and notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
