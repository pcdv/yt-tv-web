// Wiring: player, store, keys and the bridge to the native app.

import { createStore } from "./store.js";
import { createCommands } from "./commands.js";
import { createPlayer } from "./player.js";

const $ = (id) => document.getElementById(id);
const isTv = navigator.userAgent.includes("yt-tv/");

function nativeInfo() {
  try {
    return JSON.parse(window.YtTvNative.info());
  } catch {
    return { name: "browser", address: "" };
  }
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    const memory = {};
    return { getItem: (k) => memory[k] ?? null, setItem: (k, v) => { memory[k] = v; } };
  }
}

const store = createStore(safeStorage());
const player = createPlayer("player");
const info = nativeInfo();
const commands = createCommands({ store, player, name: info.name });

// ---- idle screen ----

function renderIdle() {
  $("tv-name").textContent = info.name;
  $("tv-address").textContent = info.address ? `(${info.address})` : "";
  $("idle").hidden = !!store.current();
}

// ---- banner ----

let hideTimer = null;
let heldByPause = false;

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function renderBanner() {
  const cur = store.current();
  if (!cur) return;
  $("banner-title").textContent = cur.title || cur.id;
  const total = store.items().length;
  const duration = player.duration();
  const time = duration ? `${formatTime(player.position())} / ${formatTime(duration)}` : formatTime(player.position());
  $("banner-meta").textContent = `${time}   ${store.index() + 1} / ${total}`;
}

/** Shows the banner for `ms` milliseconds, or until hidden when `ms` is 0. */
function showBanner(ms = 4000) {
  if (!store.current()) return;
  clearTimeout(hideTimer);
  renderBanner();
  $("banner").hidden = false;
  if (ms) hideTimer = setTimeout(hideBanner, ms);
}

function hideBanner() {
  clearTimeout(hideTimer);
  heldByPause = false;
  $("banner").hidden = true;
}

setInterval(() => { if (!$("banner").hidden) renderBanner(); }, 500);

// ---- error message ----

const SKIP_ERRORS = {
  2: "Bad video id",
  100: "Video not found",
  101: "The owner disabled embedding",
  150: "The owner disabled embedding",
};

let messageTimer = null;

function showMessage(text, ms = 3000) {
  clearTimeout(messageTimer);
  $("message").textContent = text;
  $("message").hidden = false;
  messageTimer = setTimeout(() => { $("message").hidden = true; }, ms);
}

// ---- player events ----

player.on("ended", () => {
  const cur = store.current();
  if (cur) store.setPosition(cur.id, 0);
  commands.handle({ cmd: "next" });
});

player.on("error", (code) => {
  const cur = store.current();
  if (SKIP_ERRORS[code]) {
    showMessage(SKIP_ERRORS[code]);
    setTimeout(() => {
      if (store.current() === cur) commands.handle({ cmd: "next" });
    }, 3000);
  } else {
    showMessage(`Player error ${code}`);
  }
});

player.on("state", (playing) => {
  if (!playing) {
    heldByPause = true;
    showBanner(0);
  } else if (heldByPause) {
    heldByPause = false;
    showBanner(4000);
  }
});

player.on("title", (id, title) => store.setTitle(id, title));

// ---- titles ----

const titleRequests = new Set();

function fetchMissingTitles() {
  for (const it of store.items()) {
    if (it.title || titleRequests.has(it.id)) continue;
    titleRequests.add(it.id);
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://youtu.be/${it.id}`)}&format=json`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && data.title) store.setTitle(it.id, data.title); })
      .catch(() => {}); // the player gives the title when the video loads
  }
}

// ---- store changes ----

let lastVideo = null;

store.onChange(() => {
  renderIdle();
  fetchMissingTitles();
  const cur = store.current();
  const key = cur ? `${store.index()}:${cur.id}` : null;
  if (key !== lastVideo) {
    lastVideo = key;
    if (key) showBanner(4000);
    else hideBanner();
  } else if (!$("banner").hidden) {
    renderBanner();
  }
});

setInterval(() => {
  const cur = store.current();
  if (cur && player.playing()) store.setPosition(cur.id, player.position());
}, 5000);

window.addEventListener("pagehide", () => {
  const cur = store.current();
  if (cur) store.setPosition(cur.id, player.position());
});

// ---- keys ----

function key(name) {
  const act = (cmd) => commands.handle(cmd);
  const seek = (by) => { act({ cmd: "seek", by }); showBanner(4000); };
  switch (name) {
    case "ChannelUp": case "Next": act({ cmd: "next" }); break;
    case "ChannelDown": case "Previous": act({ cmd: "prev" }); break;
    case "Ok": case "PlayPause": act({ cmd: "toggle" }); break;
    case "Play": act({ cmd: "resume" }); break;
    case "Pause": act({ cmd: "pause" }); break;
    case "Left": seek(-10); break;
    case "Right": seek(10); break;
    case "Rewind": seek(-30); break;
    case "FastForward": seek(30); break;
    case "Up": case "Down": case "Info": showBanner(4000); break;
    case "Back":
      if ($("banner").hidden) return false;
      hideBanner();
      return true;
    default: return false;
  }
  return true;
}

const DESKTOP_KEYS = {
  PageUp: "ChannelUp", PageDown: "ChannelDown", " ": "PlayPause", ArrowLeft: "Left",
  ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", Enter: "Ok", Escape: "Back", i: "Info",
};

document.addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  const name = DESKTOP_KEYS[e.key];
  if (!name) return;
  e.preventDefault();
  key(name);
});

// ---- start ----

function start() {
  $("power").hidden = true;
  const cur = store.current();
  if (cur) player.play(cur.id, store.position(cur.id));
}

window.yttv = {
  key,
  command: (obj) => commands.handle(obj),
};

renderIdle();
fetchMissingTitles();

if (isTv) {
  start();
} else {
  $("power").hidden = false;
  $("power-button").addEventListener("click", start);
}

if (new URLSearchParams(location.search).has("debug")) {
  $("debug").hidden = false;
  $("debug").addEventListener("click", (e) => {
    const cmd = e.target.dataset && e.target.dataset.cmd;
    if (!cmd) return;
    const answer = window.yttv.command({ cmd, text: $("debug-text").value });
    $("debug-answer").textContent = JSON.stringify(answer, null, 1);
    if (answer.ok) $("debug-text").value = "";
  });
}

if (window.YtTvNative && window.YtTvNative.ready) window.YtTvNative.ready();
