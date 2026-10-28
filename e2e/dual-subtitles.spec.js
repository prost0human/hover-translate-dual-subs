const { test, expect } = require("./extension.js");

const original = "I didn't expect him to back down.";
const translated = "Я не ожидал, что он отступит.";

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

  await storage.set("sync", { dualSubtitleSettings: { enabled: true, showRussian: true, crossHighlight: false, fontSize: 30 } });
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
  const requested = network.to("translate.googleapis.com").map(({ url }) => url.searchParams.get("q"));
  expect(requested.filter((text) => text?.startsWith("We ")).length).toBeGreaterThan(1);
  expect(await player.frame.evaluate(() => window.emptyRussianFrames)).toBe(0);

  await player.fixture("appendLine", "today together");
  await expect(overlay).toHaveText(`[ru] ${full} today together`);
  await player.fixture("rollUp");
  await expect(player.word("today")).toBeVisible();
  await expect(overlay).not.toBeEmpty();
  await expect(overlay).toHaveText("[ru] today together");
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
