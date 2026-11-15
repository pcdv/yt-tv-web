// The protocol: command in, answer out. No DOM: node tests it with a fake player.
//
// The player interface: play(id, start), pause(), resume(), stop(), seekBy(s), position(),
// duration(), playing(). `settings` is a settings.js object.

import { parseYouTube } from "./youtube-url.js";

export const PROTOCOL = 1;

export function createCommands({ store, player, settings, name = "yt-tv" }) {
  const ok = () => ({ ok: true, state: state() });
  const fail = (error) => ({ ok: false, error });

  function state() {
    const cur = store.current();
    return {
      protocol: PROTOCOL,
      name,
      playing: !!cur && player.playing(),
      channel: "queue",
      languages: settings.languages(),
      index: store.index(),
      current: cur && {
        id: cur.id,
        title: cur.title,
        position: player.position(),
        duration: player.duration(),
      },
      items: store.items(),
    };
  }

  /** Starts the current item of the store, or stops the player when there is none. */
  function playCurrent(start = 0) {
    const cur = store.current();
    if (cur) player.play(cur.id, start || store.position(cur.id));
    else player.stop();
  }

  function addLink(text, now) {
    const link = parseYouTube(text);
    if (!link) return fail("Not a YouTube link");
    const wasIdle = !store.current();
    const added = now ? store.playNext(link) : store.append(link);
    if (!added) return fail("The queue is full");
    // a link plays from its own start time, a queued one keeps it until its turn
    if (now || wasIdle || link.start) store.setPosition(link.id, link.start);
    if (now || wasIdle) playCurrent();
    return ok();
  }

  function move(step) {
    const target = step > 0 ? store.next() : store.prev();
    if (!target && step < 0) return ok(); // already at the first video
    playCurrent();
    return ok();
  }

  const actions = {
    play: (c) => addLink(c.text, true),
    queue: (c) => addLink(c.text, false),
    toggle: () => {
      if (!store.current()) return ok();
      if (player.playing()) player.pause();
      else player.resume();
      return ok();
    },
    pause: () => {
      if (store.current() && player.playing()) player.pause();
      return ok();
    },
    resume: () => {
      if (store.current() && !player.playing()) player.resume();
      return ok();
    },
    next: () => move(1),
    prev: () => move(-1),
    restart: () => {
      const cur = store.current();
      if (cur) player.play(cur.id, 0);
      return ok();
    },
    seek: (c) => {
      if (typeof c.by !== "number" || !Number.isFinite(c.by)) return fail("seek needs a number of seconds");
      if (store.current()) player.seekBy(c.by);
      return ok();
    },
    // applies to the next video: the playing one keeps its track
    settings: (c) => {
      if (c.languages !== undefined && !settings.setLanguages(c.languages)) {
        return fail("languages must be a list of 1 to 10 language codes, or original");
      }
      return ok();
    },
  };

  return {
    state,
    handle(command) {
      if (!command || typeof command !== "object") return fail("The command must be a JSON object");
      const action = Object.hasOwn(actions, command.cmd) ? actions[command.cmd] : null;
      if (!action) return fail(`Unknown command: ${command.cmd}`);
      try {
        return action(command);
      } catch (e) {
        return fail(String(e && e.message || e));
      }
    },
  };
}
