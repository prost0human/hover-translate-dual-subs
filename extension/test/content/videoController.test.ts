// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoController } from "../../src/content/core/videoController.ts";
import { defaultSettings } from "../../src/common/consts/defaultValues.ts";
import { state } from "../../src/content/state/stateManager.ts";

let video: HTMLVideoElement;
let playing: boolean;
let controller: VideoController;
let play: () => Promise<void>;
let pause: () => void;
beforeEach(() => {
  state.settings = { ...defaultSettings };
  video = document.createElement("video");
  playing = true;
  Object.defineProperty(video, "paused", { get: () => !playing });
  pause = vi.fn(() => { playing = false; });
  play = vi.fn(() => { playing = true; return Promise.resolve(); });
  video.pause = pause;
  video.play = play;
  controller = new VideoController();
});
describe("hover pause ownership", () => {
  it("pauses a playing video and resumes only the pause it owns", () => {
    controller.pauseVideo(video); expect(pause).toHaveBeenCalledOnce();
    controller.handleVideoPlay(); expect(play).toHaveBeenCalledOnce();
    controller.handleVideoPlay(); expect(play).toHaveBeenCalledOnce();
  });
  it("never resumes a video already paused by the user", () => {
    playing = false; controller.pauseVideo(video); controller.handleVideoPlay();
    expect(pause).not.toHaveBeenCalled(); expect(play).not.toHaveBeenCalled();
  });
  it("releases its claim if the user resumes the video themselves", () => {
    controller.pauseVideo(video); playing = true; video.dispatchEvent(new Event("play"));
    playing = false; controller.handleVideoPlay(); expect(play).not.toHaveBeenCalled();
  });
  it("does nothing if auto pause is off", () => {
    state.settings.autoPause = false; controller.pauseVideo(video); controller.handleVideoPlay();
    expect(pause).not.toHaveBeenCalled(); expect(play).not.toHaveBeenCalled();
  });
});
