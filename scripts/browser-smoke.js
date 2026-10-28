/*
 * Browser smoke test of the built content script, NOT a test of an installed
 * extension/service worker. It uses the shared local YouTube fixture, the same
 * mock translators as Playwright E2E, and a minimal in-page chrome API.
 *
 * npm run setup:chrome && npm run build
 * HT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-smoke.js
 * HT_CHROMIUM_PATH may point at headless shell; LD_LIBRARY_PATH is inherited.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const { createFakeTranslators } = require("../e2e/translators.js");

const root = path.resolve(__dirname, "..");
const fixture = path.join(root, "e2e/fixtures");
const files = {
  "/watch": ["watch.html", "text/html"],
  "/__fixture/player.js": ["player.js", "text/javascript"],
  "/__fixture/player.css": ["player.css", "text/css"],
  "/__fixture/video.webm": ["video.webm", "video/webm"],
};
const original = "I didn't expect him to back down.";
const translated = "Я не ожидал, что он отступит.";

async function main() {
  const network = createFakeTranslators();
  network.translate("ru", "I didn't expect him to back down", translated);
  network.translate("ru", "back down", "отступить");
  network.translate("ru", "I look forward to it", "Я с нетерпением ждал этого");
  network.translate("ru", "look forward to", "с нетерпением жду");
  const browser = await chromium.launch({
    executablePath: process.env.HT_CHROMIUM_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.host === "www.youtube.com" && files[url.pathname]) {
        const [name, contentType] = files[url.pathname];
        return route.fulfill({ status: 200, contentType, body: fs.readFileSync(path.join(fixture, name)) });
      }
      if (network.handles(url.host)) {
        const response = network.respond({ url, headers: request.headers(), body: request.postData() ?? "" });
        return response === "abort" ? route.abort("internetdisconnected") : route.fulfill(response);
      }
      return route.abort("blockedbyclient");
    });
    await page.addInitScript(() => {
      const listeners = [];
      const db = {
        sync: {
          settings: { sourceLanguageCode: "auto", targetLanguageCode: "ru", translator: "google", autoPause: true, leftClickAction: "save-to-dictionary", alwaysMultipleSelection: false, showNotifications: true },
          dualSubtitleSettings: { enabled: true, showRussian: true, crossHighlight: true },
        },
        local: {},
      };
      const area = (name) => ({
        get(keys, callback) {
          const wanted = keys == null ? Object.keys(db[name]) : Array.isArray(keys) ? keys : [keys];
          const data = Object.fromEntries(wanted.filter((key) => key in db[name]).map((key) => [key, db[name][key]]));
          if (callback) { queueMicrotask(() => callback(data)); return; }
          return Promise.resolve(data);
        },
        set(values, callback) {
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: db[name][key], newValue: value };
            db[name][key] = value;
          }
          listeners.forEach((listener) => listener(changes, name));
          if (callback) queueMicrotask(callback);
          return Promise.resolve();
        },
        remove(key, callback) { delete db[name][key]; if (callback) queueMicrotask(callback); return Promise.resolve(); },
      });
      window.__smokeStorage = db;
      window.chrome = window.chrome || {};
      window.chrome.storage = {
        sync: area("sync"), local: area("local"),
        onChanged: {
          addListener(listener) { listeners.push(listener); },
          removeListener(listener) { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); },
        },
      };
      window.chrome.i18n = { getMessage: (key) => ({ translationSaved: "Translation saved", dualSubtitleError: "Translation unavailable" }[key] || key), getUILanguage: () => "en" };
      window.chrome.runtime = {
        id: "smoke", getURL: (url) => `chrome-extension://smoke/${url}`,
        sendMessage(message) {
          if (message.action === "saveDictionaryEntry") {
            (db.local.savedTranslations ??= []).unshift(message.value);
            return Promise.resolve({ count: db.local.savedTranslations.length });
          }
          if (message.action === "hasPermissions") return Promise.resolve({ granted: true });
          return Promise.resolve({ success: true });
        },
      };
    });
    await page.goto("https://www.youtube.com/watch?v=fixture");
    await page.addStyleTag({ path: path.join(root, "extension/dist/styles.css") });
    await page.addScriptTag({ path: path.join(root, "extension/dist/content.bundle.js") });
    const caption = (text) => page.evaluate((value) => window.fixture.captions(value), text);
    const word = (text) => page.locator(".custom-tooltip-word").filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first();
    const overlay = page.locator(".ht-dual-subtitle");
    await caption(original);
    await page.waitForFunction((text) => document.querySelector(".ht-dual-subtitle")?.textContent === text, translated);
    const position = await page.evaluate(() => {
      const ru = document.querySelector(".ht-dual-subtitle");
      const en = document.querySelector(".caption-window");
      return { ruBottom: ru.getBoundingClientRect().bottom, enTop: en.getBoundingClientRect().top, pointer: getComputedStyle(ru).pointerEvents };
    });
    assert.ok(position.ruBottom <= position.enTop);
    assert.equal(position.pointer, "none");

    await word("back").hover();
    await page.keyboard.down("Shift"); await word("down.").hover(); await page.keyboard.up("Shift");
    await page.waitForFunction(() => document.querySelector(".custom-tooltip")?.textContent === "отступить");
    assert.equal(await overlay.locator("mark").textContent(), "отступит");
    assert.equal(await page.locator("video").evaluate((video) => video.paused), true);
    await word("down.").click();
    await page.waitForFunction(() => window.__smokeStorage.local.savedTranslations?.length === 1);
    const saved = await page.evaluate(() => window.__smokeStorage.local.savedTranslations[0]);
    assert.equal(saved.originalText, "back down");
    assert.equal(saved.exampleOriginal, original);
    assert.equal(saved.exampleTranslation, translated);
    assert.match(saved.videoUrl, /v=fixture/);
    await page.mouse.move(1, 1);
    await page.waitForFunction(() => !document.querySelector("video").paused);
    await caption(original);
    await page.waitForFunction((text) => document.querySelector(".ht-dual-subtitle")?.textContent === text, translated);
    assert.equal(network.to("translate.googleapis.com").filter(({ url }) => url.searchParams.get("q") === "I didn't expect him to back down").length, 1);

    await caption("I look forward to it.");
    await page.waitForFunction(() => document.querySelector(".ht-dual-subtitle")?.textContent === "Я с нетерпением ждал этого");
    await word("look").hover(); await page.keyboard.down("Shift"); await word("forward").hover(); await word("to").hover(); await page.keyboard.up("Shift");
    await page.waitForFunction(() => document.querySelector(".custom-tooltip")?.textContent === "с нетерпением жду");
    assert.equal(await overlay.locator("mark").textContent(), "с нетерпением ждал");
    assert.deepEqual(errors, []);
    console.log("PASS: mock-API browser smoke — placement, both phrases, pause/resume, context save and cache.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
