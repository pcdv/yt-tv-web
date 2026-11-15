// Finds a YouTube video in shared text. No DOM: node tests it.

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const PATH_KINDS = new Set(["shorts", "live", "embed", "v"]);

/** Seconds from "90", "90s" or "1h2m3s"; 0 when the text is not a time. */
export function parseTime(text) {
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!m || !(m[1] || m[2] || m[3])) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function fromUrl(url) {
  const host = url.hostname.toLowerCase();
  let id = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (HOSTS.has(host)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (PATH_KINDS.has(parts[0])) id = parts[1];
  }
  if (!id || !ID.test(id)) return null;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const start = parseTime(url.searchParams.get("t") || url.searchParams.get("start") || hash.get("t"));
  return { id, start };
}

/** Returns {id, start} for the first YouTube link in the text, or null. */
export function parseYouTube(text) {
  if (typeof text !== "string") return null;
  for (const raw of text.match(/https?:\/\/[^\s<>"']+/gi) || []) {
    let url;
    try {
      url = new URL(raw.replace(/[.,;:!?)\]]+$/, ""));
    } catch {
      continue;
    }
    const found = fromUrl(url);
    if (found) return found;
  }
  return null;
}
