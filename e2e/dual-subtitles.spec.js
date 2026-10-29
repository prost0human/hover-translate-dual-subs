const { test, expect } = require("./extension.js");

const original = "I didn't expect him to back down.";
const translated = "Я не ожидал, что он отступит.";

// Left edge of the first painted line, not the content-sized right edge.
const russianMetrics = (frame) => frame.evaluate(() => {
  const overlay = document.querySelector(".ht-dual-subtitle");
  const content = overlay.querySelector(".ht-dual-subtitle-content");
  const native = document.querySelector(".caption-window .ytp-caption-segment");
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let first = walker.nextNode();
  while (first && !first.textContent.trim()) first = walker.nextNode();
  if (!first) throw new Error("Russian text has no visible character");
  const start = first.textContent.search(/\S/);
  const range = document.createRange();
  range.setStart(first, start); range.setEnd(first, start + 1);
  return {
    left: range.getBoundingClientRect().left,
    textAlign: getComputedStyle(overlay).textAlign,
    russianSize: getComputedStyle(overlay).fontSize,
    nativeSize: getComputedStyle(native).fontSize,
    russianFamily: getComputedStyle(overlay).fontFamily,
    nativeFamily: getComputedStyle(native).fontFamily,
  };
});

test.beforeEach(async ({ storage, network }) => {
  await storage.updateSettings({ sourceLanguageCode: "auto", targetLanguageCode: "ru", autoPause: true });
  await storage.set("sync", { dualSubtitleSettings: { enabled: true, showRussian: true, crossHighlight: true } });
  network.translate("ru", "I didn't expect him to back down", translated);
  network.translate("ru", "back down", "отступить");
  network.translate("ru", "look forward to", "с нетерпением жду");
  network.translate("ru", "I look forward to it", "Я с нетерпением ждал этого");
});

test("Russian above native English; Shift selection, pause, save and persistence", async ({ openPlayer, storage, network }) => {
  const player = await openPlayer();
  await player.captions(original);
  const overlay = player.frame.locator(".ht-dual-subtitle");
  await expect(overlay).toHaveText(translated);
  const ruBox = await overlay.boundingBox();
  const enBox = await player.frame.locator(".caption-window").boundingBox();
  expect(ruBox.y + ruBox.height).toBeLessThanOrEqual(enBox.y);
  expect(await overlay.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe("none");

  await player.word("back").hover();
  expect(await player.isPaused()).toBe(true);
  await player.page.keyboard.down("Shift");
  await player.word("down.").hover();
  await player.page.keyboard.up("Shift");
  await expect(player.tooltip).toHaveText("отступить");
  await expect(overlay).toHaveAttribute("data-alignment", "phrase");
  await expect(overlay.locator("mark")).toHaveText("отступит");
  await player.word("down.").click();
  await expect.poll(async () => (await storage.get("local", "savedTranslations"))?.length).toBe(1);
  const [saved] = await storage.get("local", "savedTranslations");
  expect(saved).toMatchObject({ originalText: "back down", translatedText: "отступить", exampleOriginal: original, exampleTranslation: translated });
  expect(saved.videoUrl).toContain("v=fixture");
  await player.moveAway();
  await expect.poll(() => player.isPaused()).toBe(false);

  // A recreated window with the same text is a cache hit, not another request.
  await player.captions(original);
  await expect(overlay).toHaveText(translated);
  expect(network.to("translate.googleapis.com").filter((request) => request.url.searchParams.get("q") === "I didn't expect him to back down")).toHaveLength(1);
  await player.page.reload();
  expect((await storage.get("local", "savedTranslations"))[0].originalText).toBe("back down");
});

test("switching lines and settings, including a second phrase", async ({ openPlayer, storage }) => {
  const player = await openPlayer();
  await player.captions("I look forward to it.");
  const overlay = player.frame.locator(".ht-dual-subtitle");
  await expect(overlay).toHaveText("Я с нетерпением ждал этого");
  await player.word("look").hover();
  await player.page.keyboard.down("Shift");
  await player.word("forward").hover();
  await player.word("to").hover();
  await player.page.keyboard.up("Shift");
  await expect(player.tooltip).toHaveText("с нетерпением жду");
  await expect(overlay.locator("mark")).toHaveText("с нетерпением ждал");

  await storage.set("sync", { dualSubtitleSettings: { enabled: true, showRussian: true, crossHighlight: false, matchYouTubeFontSize: false, fontSize: 30 } });
  await expect(overlay.locator("mark")).toHaveCount(0);
  await expect(overlay).toHaveCSS("font-size", "30px");
  await player.captions("Русские субтитры");
  await expect(overlay).toHaveCount(0);
  await storage.set("sync", { dualSubtitleSettings: { enabled: false } });
  await player.captions(original);
  await expect(overlay).toHaveCount(0);
  // The native English words and their original tooltip still work.
  await player.word("back").hover();
  await expect(player.tooltip).toHaveText("[ru] back");
});

test("a video paused by the viewer is not resumed when the pointer leaves", async ({ openPlayer }) => {
  const player = await openPlayer();
  await player.captions(original);
  await player.frame.evaluate(() => document.querySelector("#movie_player video").pause());
  await player.word("back").hover();
  expect(await player.isPaused()).toBe(true);
  await player.moveAway();
  expect(await player.isPaused()).toBe(true);
});

test("automatic captions are translated while words keep arriving, survive roll-up and vanish with the track", async ({ openPlayer, network }) => {
  network.translate("ru", "We", "Мы");
  const player = await openPlayer();
  await player.captions("We");
  const overlay = player.frame.locator(".ht-dual-subtitle");
  await expect(overlay).toHaveText("Мы");
  const before = await russianMetrics(player.frame);
  expect(before.textAlign).toBe("left");
  expect(before.russianSize).toBe(before.nativeSize);
  expect(before.russianFamily).toBe(before.nativeFamily);
  await player.frame.evaluate(() => {
    const node = document.querySelector(".ht-dual-subtitle");
    window.emptyRussianFrames = 0;
    window.dualObserver = new MutationObserver(() => { if (!node.textContent) window.emptyRussianFrames++; });
    window.dualObserver.observe(node, { childList: true, characterData: true, subtree: true });
  });
  const words = ["are", "learning", "English", "every", "day", "at", "home", "with", "our", "friends"];
  for (const word of words) {
    await player.fixture("appendWord", word);
    await player.page.waitForTimeout(140);
  }
  const full = `We ${words.join(" ")}`;
  await expect(overlay).toHaveText(`[ru] ${full}`);
  const after = await russianMetrics(player.frame);
  expect(Math.abs(after.left - before.left)).toBeLessThan(0.5);
  const requested = network.to("translate.googleapis.com").map(({ url }) => url.searchParams.get("q"));
  expect(requested.filter((text) => text?.startsWith("We ")).length).toBeGreaterThan(1);
  expect(await player.frame.evaluate(() => window.emptyRussianFrames)).toBe(0);

  await player.fixture("appendLine", "today together");
  await expect(overlay).toHaveText(`[ru] ${full} today together`);
  await player.fixture("rollUp");
  await expect(player.word("today")).toBeVisible();
  await expect(overlay).not.toBeEmpty();
  await expect(overlay).toHaveText("[ru] today together");
  const beforeCorrection = await russianMetrics(player.frame);
  await player.frame.evaluate(() => { document.querySelector(".ytp-caption-segment").textContent = "Today we practice"; });
  await expect(overlay).toHaveText("[ru] Today we practice");
  expect(Math.abs((await russianMetrics(player.frame)).left - beforeCorrection.left)).toBeLessThan(0.5);
  await player.fixture("captions", []);
  await expect(overlay).toHaveCount(0);
});

test("top position follows the player, survives full screen, stacks windows and leaves English clickable", async ({ openPlayer, storage }) => {
  await storage.set("sync", { dualSubtitleSettings: { enabled: true, showRussian: true, crossHighlight: true, position: "top" } });
  const player = await openPlayer();
  await player.captions([{ lines: [original] }, { lines: ["Another speaker"], position: "top" }]);
  const overlays = player.frame.locator(".ht-dual-subtitle");
  await expect(overlays).toHaveCount(2);
  await expect(overlays.first()).toHaveText(translated);
  await expect(overlays.nth(1)).toHaveText("[ru] Another speaker");
  const playerBox = () => player.frame.locator("#movie_player").boundingBox();
  const centeredAtTop = async () => {
    const box = await playerBox();
    const ru = await overlays.first().boundingBox();
    return { offset: ru.y - box.y, centerError: Math.abs(ru.x + ru.width / 2 - (box.x + box.width / 2)) };
  };
  await expect.poll(async () => (await centeredAtTop()).offset).toBeCloseTo(14, 0);
  expect((await centeredAtTop()).centerError).toBeLessThan(1);
  const first = await overlays.first().boundingBox();
  const second = await overlays.nth(1).boundingBox();
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  expect(await overlays.first().evaluate((node) => getComputedStyle(node).pointerEvents)).toBe("none");

  await player.word("back").hover();
  await expect(player.tooltip).toHaveText("[ru] back");
  const tooltip = await player.tooltip.boundingBox();
  const english = await player.frame.locator(".caption-window").first().boundingBox();
  expect(tooltip.y).toBeGreaterThan(first.y + first.height);
  expect(tooltip.y + tooltip.height).toBeLessThan(english.y);
  await player.word("back").click();
  await expect.poll(async () => (await storage.get("local", "savedTranslations"))?.[0]?.originalText).toBe("back");

  await player.frame.evaluate(() => { document.querySelector("#player-container").style.width = "640px"; });
  await expect.poll(async () => (await centeredAtTop()).centerError).toBeLessThan(1);
  await player.frame.evaluate(() => { document.querySelector("#player-container").style.width = ""; });
  await player.frame.getByRole("button", { name: "Full screen (f)" }).click();
  await expect.poll(() => player.frame.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect.poll(async () => (await centeredAtTop()).centerError).toBeLessThan(1);
  await expect.poll(async () => (await centeredAtTop()).offset).toBeCloseTo(14, 0);
  expect((await storage.get("sync", "dualSubtitleSettings")).position).toBe("top");
});

test("left-aligned native captions keep the same text start as both lines grow", async ({ openPlayer, network }) => {
  network.translate("ru", "We", "Мы");
  const player = await openPlayer();
  await player.captions([{ lines: ["We"], style: "text-align: left; left: 15%; width: max-content; margin-left: 0px;" }]);
  await player.frame.evaluate(() => { document.querySelector(".caption-window").dataset.dragged = "true"; });
  const overlay = player.frame.locator(".ht-dual-subtitle");
  await expect(overlay).toHaveText("Мы");
  const first = await russianMetrics(player.frame);
  const nativeLeft = () => player.frame.locator(".ytp-caption-segment").first().evaluate((node) => node.getBoundingClientRect().left);
  expect(Math.abs(first.left - await nativeLeft())).toBeLessThan(1);
  const words = ["are", "learning", "English", "together", "today"];
  for (const word of words) {
    await player.fixture("appendWord", word);
    await player.page.waitForTimeout(160);
  }
  await expect(overlay).toHaveText(`[ru] We ${words.join(" ")}`);
  const last = await russianMetrics(player.frame);
  expect(Math.abs(last.left - first.left)).toBeLessThan(0.5);
  expect(Math.abs(last.left - await nativeLeft())).toBeLessThan(1);
  const englishRows = await player.frame.locator(".ytp-caption-segment .custom-tooltip-word")
    .evaluateAll((words) => words.map((word) => Math.round(word.getBoundingClientRect().top)));
  expect(new Set(englishRows).size).toBe(1);

  // A deliberate move of the native caption still moves the Russian frame.
  await player.frame.evaluate(() => { document.querySelector(".caption-window").style.left = "25%"; });
  await expect.poll(async () => (await russianMetrics(player.frame)).left - first.left).toBeGreaterThan(80);
});

test("top captions follow YouTube font changes and keep a fixed left edge", async ({ openPlayer, storage, network }) => {
  await storage.set("sync", { dualSubtitleSettings: { enabled: true, position: "top" } });
  network.translate("ru", "We", "Мы");
  const player = await openPlayer();
  await player.captions("We");
  const overlay = player.frame.locator(".ht-dual-subtitle");
  await expect(overlay).toHaveText("Мы");
  await player.frame.evaluate(() => {
    const segment = document.querySelector(".ytp-caption-segment");
    segment.style.fontSize = "32px";
    segment.style.fontFamily = "Georgia, serif";
  });
  await expect.poll(async () => (await russianMetrics(player.frame)).russianSize).toBe("32px");
  let before = await russianMetrics(player.frame);
  expect(before.russianSize).toBe(before.nativeSize);
  expect(before.russianFamily).toBe(before.nativeFamily);
  expect(before.textAlign).toBe("left");
  const words = ["are", "learning", "English", "together", "today"];
  for (const word of words) {
    await player.fixture("appendWord", word);
    await player.page.waitForTimeout(160);
  }
  await expect(overlay).toHaveText(`[ru] We ${words.join(" ")}`);
  expect(Math.abs((await russianMetrics(player.frame)).left - before.left)).toBeLessThan(0.5);

  await storage.set("sync", { dualSubtitleSettings: { enabled: true, position: "top", matchYouTubeFontSize: false, fontSize: 28 } });
  await expect(overlay).toHaveCSS("font-size", "28px");
  await storage.set("sync", { dualSubtitleSettings: { enabled: true, position: "top", matchYouTubeFontSize: true } });
  await expect(overlay).toHaveCSS("font-size", "32px");
  await player.frame.getByRole("button", { name: "Full screen (f)" }).click();
  await expect.poll(() => player.frame.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await player.frame.evaluate(() => { document.querySelector(".ytp-caption-segment").style.fontSize = "40px"; });
  await expect(overlay).toHaveCSS("font-size", "40px");
  before = await russianMetrics(player.frame);
  expect(before.russianSize).toBe(before.nativeSize);
});

test("dragging centered captions carries the Russian frame without re-centering on new words", async ({ openPlayer }) => {
  const player = await openPlayer();
  await player.fixture("dragOn", "mousemove");
  await player.captions(original);
  const overlay = player.frame.locator(".ht-dual-subtitle");
  const caption = player.frame.locator(".caption-window");
  await expect(overlay).toHaveText(translated);
  const beforeRu = await overlay.boundingBox();
  const beforeEn = await caption.boundingBox();
  const word = await player.word("back").boundingBox();
  const x = word.x + word.width / 2;
  const y = word.y + word.height / 2;
  await player.page.mouse.move(x, y);
  await player.page.mouse.down();
  await player.page.mouse.move(x - 100, y - 70, { steps: 8 });
  await player.page.mouse.up();
  await expect.poll(async () => beforeEn.x - (await caption.boundingBox()).x).toBeGreaterThan(90);
  const afterRu = await overlay.boundingBox();
  const afterEn = await caption.boundingBox();
  expect((afterRu.x - beforeRu.x) - (afterEn.x - beforeEn.x)).toBeCloseTo(0, 0);
  expect((afterRu.y - beforeRu.y) - (afterEn.y - beforeEn.y)).toBeCloseTo(0, 0);
  await player.fixture("appendWord", "today");
  await expect(overlay).toHaveText(`[ru] ${original} today`);
  expect(Math.abs((await russianMetrics(player.frame)).left - afterRu.x)).toBeLessThan(0.5);
});
