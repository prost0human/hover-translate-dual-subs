import { getPlayerVideo } from "./domUtils.ts";

/** Snapshot before awaiting a translation: captions and navigation can change meanwhile. */
export function getVideoContext(player: HTMLElement | null): { videoTitle?: string; videoUrl?: string; videoTimeSeconds?: number } {
  const current = new URL(location.href);
  if (!/(^|\.)youtube\.com$/i.test(current.hostname)) return {};
  const id = current.searchParams.get("v") ?? current.pathname.match(/^\/(?:embed|shorts|live|v|e)\/([^/?]+)/)?.[1];
  const video = getPlayerVideo(player);
  const seconds = video && Number.isFinite(video.currentTime) ? Math.max(0, Math.floor(video.currentTime)) : undefined;
  const url = id ? new URL("https://www.youtube.com/watch") : null;
  if (url && id) {
    url.searchParams.set("v", id);
    if (seconds !== undefined) url.searchParams.set("t", String(seconds));
  }
  const title = document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim();
  return { videoTitle: title || undefined, videoUrl: url?.toString(), videoTimeSeconds: seconds };
}
