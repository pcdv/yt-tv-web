// Wrapper around the YouTube IFrame player.
//
// Events: "ended", "error" (code), "state" (playing: boolean), "title" (id, title).

const API_URL = "https://www.youtube.com/iframe_api";

export function createPlayer(elementId) {
  const handlers = {};
  let yt = null; // the YT.Player, once ready
  let pending = null; // a play() received before the player is ready
  let playing = false;
  let currentId = null;

  const emit = (name, ...args) => (handlers[name] || []).forEach((fn) => fn(...args));

  function onStateChange(e) {
    const S = window.YT.PlayerState;
    if (e.data === S.ENDED) {
      playing = false;
      emit("ended");
    } else if (e.data === S.PLAYING) {
      playing = true;
      emit("state", true);
      const title = yt.getVideoData && yt.getVideoData().title;
      if (title) emit("title", currentId, title);
    } else if (e.data === S.PAUSED) {
      playing = false;
      emit("state", false);
    }
  }

  function create() {
    yt = new window.YT.Player(elementId, {
      host: "https://www.youtube-nocookie.com",
      width: "100%",
      height: "100%",
      playerVars: { controls: 0, disablekb: 1, rel: 0, iv_load_policy: 3, playsinline: 1, fs: 0,
        origin: location.origin },
      events: {
        onReady: () => {
          if (pending) {
            const [id, start] = pending;
            pending = null;
            api.play(id, start);
          }
        },
        onStateChange,
        onError: (e) => {
          playing = false;
          emit("error", e.data);
        },
      },
    });
  }

  window.onYouTubeIframeAPIReady = create;
  const script = document.createElement("script");
  script.src = API_URL;
  document.head.append(script);

  const api = {
    on(name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    play(id, start = 0) {
      currentId = id;
      if (!yt || !yt.loadVideoById) {
        pending = [id, start];
        return;
      }
      yt.loadVideoById({ videoId: id, startSeconds: start });
    },
    pause: () => yt && yt.pauseVideo && yt.pauseVideo(),
    resume: () => yt && yt.playVideo && yt.playVideo(),
    stop() {
      pending = null;
      playing = false;
      if (yt && yt.stopVideo) yt.stopVideo();
    },
    seekBy(seconds) {
      if (!yt || !yt.getCurrentTime) return;
      const to = Math.max(0, yt.getCurrentTime() + seconds);
      yt.seekTo(to, true);
    },
    position: () => (yt && yt.getCurrentTime ? yt.getCurrentTime() : 0) || 0,
    duration: () => (yt && yt.getDuration ? yt.getDuration() : 0) || 0,
    playing: () => playing,
  };
  return api;
}
