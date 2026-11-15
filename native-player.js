// The native player of the TV app, and the player the page uses on the TV.
//
// The TV app plays videos itself (no ads) and offers them to the page as `window.YtTvNative`.
// Both players here have the interface of player.js: play(id, start), pause, resume, stop,
// seekBy, position, duration, playing, and the events "ended", "error", "state", "title".

/** The native player. `bridge` is YtTvNative; the app calls `target.yttvNativeEvent`. */
export function createNativePlayer(bridge, target) {
  const handlers = {};
  const emit = (name, ...args) => (handlers[name] || []).forEach((fn) => fn(...args));
  target.yttvNativeEvent = (name, args) => emit(name, ...(args || []));
  return {
    on(name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    play: (id, start = 0) => bridge.playerPlay(id, start),
    pause: () => bridge.playerPause(),
    resume: () => bridge.playerResume(),
    stop: () => bridge.playerStop(),
    seekBy: (seconds) => bridge.playerSeekBy(seconds),
    position: () => bridge.playerPosition() || 0,
    duration: () => bridge.playerDuration() || 0,
    playing: () => !!bridge.playerPlaying(),
  };
}

/**
 * Tries the native player for every video. When it fails (the extractor cannot read the video,
 * or the playback breaks), the same video plays in the embedded player, from the same position.
 * `makeEmbedded()` creates the embedded player on first use. `onMode(native)` tells the page
 * which one shows the video.
 */
export function createSwitchingPlayer({ native, makeEmbedded, onMode = () => {} }) {
  const handlers = {};
  const emit = (name, ...args) => (handlers[name] || []).forEach((fn) => fn(...args));
  let embedded = null;
  let active = native;
  let current = null; // { id, start } of the video being played

  const forward = (source, name) => source.on(name, (...args) => {
    if (active === source) emit(name, ...args);
  });
  for (const name of ["ended", "state", "title"]) forward(native, name);

  native.on("error", () => {
    if (active !== native || !current) return;
    const at = native.position() || current.start;
    native.stop();
    useEmbedded();
    embedded.play(current.id, at);
  });

  function useEmbedded() {
    if (!embedded) {
      embedded = makeEmbedded();
      for (const name of ["ended", "state", "title", "error"]) forward(embedded, name);
    }
    active = embedded;
    onMode(false);
  }

  return {
    on(name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    play(id, start = 0) {
      current = { id, start };
      if (active === embedded && embedded) embedded.stop();
      active = native;
      onMode(true);
      native.play(id, start);
    },
    pause: () => active.pause(),
    resume: () => active.resume(),
    stop() {
      current = null;
      active.stop();
    },
    seekBy: (seconds) => active.seekBy(seconds),
    position: () => active.position(),
    duration: () => active.duration(),
    playing: () => active.playing(),
  };
}
