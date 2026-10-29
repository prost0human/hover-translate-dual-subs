// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { SubtitleCore } from "../../src/content/core/subtitleCore.ts";
import { TooltipService } from "../../src/content/services/tooltipService.ts";

afterEach(() => { document.body.innerHTML = ""; });

it("measures a growing caption at YouTube's width while narrowing the pause hit area", () => {
  document.body.innerHTML = "<div class=\"caption-window\" style=\"width: 560px\"><span class=\"ytp-caption-segment\">We</span></div>";
  const caption = document.querySelector<HTMLElement>(".caption-window")!;
  const segment = document.querySelector<HTMLElement>(".ytp-caption-segment")!;
  let textWidth = 100;
  const measuredAt: string[] = [];
  vi.spyOn(segment, "getBoundingClientRect").mockImplementation(() => {
    measuredAt.push(caption.style.width);
    return { width: Math.min(textWidth, parseFloat(caption.style.width)) } as DOMRect;
  });
  const core = new SubtitleCore({} as TooltipService);
  core.updateCaptionWindowSize();
  expect(caption.style.width).toBe("100px");
  textWidth = 240;
  core.updateCaptionWindowSize();
  expect(caption.style.width).toBe("240px");
  expect(measuredAt).toEqual(["560px", "560px"]);

  // An actual width change from YouTube, e.g. after a resize, is respected.
  caption.style.width = "180px";
  textWidth = 250;
  core.updateCaptionWindowSize();
  expect(caption.style.width).toBe("180px");
  textWidth = 120;
  core.updateCaptionWindowSize();
  expect(caption.style.width).toBe("120px");
  expect(measuredAt.slice(-2)).toEqual(["180px", "180px"]);
  // Rebuilding the content pipeline must not lose YouTube's original width.
  textWidth = 160;
  new SubtitleCore({} as TooltipService).updateCaptionWindowSize();
  expect(caption.style.width).toBe("160px");
  expect(measuredAt[measuredAt.length - 1]).toBe("180px");
});
