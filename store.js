// The queue channel and its persistence. No DOM: node tests it with a fake storage.
//
// `items` before `index` are the history, items after it are coming. `index === items.length`
// means nothing is current (empty queue, or the last video ended).

export const STORAGE_KEY = "yttv.state.v1";
export const MAX_ITEMS = 200;

export function createStore(storage, now = Date.now) {
  let items = [];
  let index = 0;
  let positions = {};
  const listeners = [];

  function load() {
    try {
      const data = JSON.parse(storage.getItem(STORAGE_KEY));
      if (!data || !Array.isArray(data.items)) return;
      const ok = data.items
        .filter((it) => it && typeof it.id === "string")
        .map((it) => ({ id: it.id, title: typeof it.title === "string" ? it.title : "",
          addedAt: Number(it.addedAt) || 0 }));
      items = ok.slice(-MAX_ITEMS);
      index = Number.isInteger(data.index) ? Math.min(Math.max(data.index, 0), items.length) : 0;
      if (ok.length > items.length) index = Math.max(0, index - (ok.length - items.length));
      positions = data.positions && typeof data.positions === "object" ? data.positions : {};
    } catch {
      items = [];
      index = 0;
      positions = {};
    }
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ items, index, positions }));
    } catch {
      // storage full or blocked: the queue keeps working in memory
    }
  }

  function changed() {
    save();
    for (const fn of listeners) fn();
  }

  function insertAt(position, item) {
    items.splice(position, 0, { id: item.id, title: item.title || "", addedAt: now() });
    // drop the oldest history first
    while (items.length > MAX_ITEMS && index > 0) {
      items.shift();
      index--;
      position--;
    }
    return position;
  }

  function full() {
    return items.length - index >= MAX_ITEMS;
  }

  load();

  return {
    onChange: (fn) => listeners.push(fn),
    items: () => items.slice(),
    index: () => index,
    current: () => items[index] || null,
    comingCount: () => Math.max(0, items.length - index - 1),

    /** Inserts after the current video and makes it current. False when the queue is full. */
    playNext(item) {
      if (full()) return false;
      index = insertAt(Math.min(index + 1, items.length), item);
      changed();
      return true;
    },

    /** Appends. The new item becomes current when nothing is current. False when full. */
    append(item) {
      if (full()) return false;
      const wasIdle = !this.current();
      const position = insertAt(items.length, item);
      if (wasIdle) index = position;
      changed();
      return true;
    },

    /** Moves to the next item; returns it, or null after the last one. */
    next() {
      if (index < items.length) index++;
      changed();
      return this.current();
    },

    /** Moves to the previous item; returns it, or null at the start. */
    prev() {
      if (index === 0) return null;
      index--;
      changed();
      return this.current();
    },

    setTitle(id, title) {
      let touched = false;
      for (const it of items) {
        if (it.id === id && it.title !== title) {
          it.title = title;
          touched = true;
        }
      }
      if (touched) changed();
    },

    position: (id) => positions[id] || 0,

    /** Remembers the position of a video; 0 forgets it. Saves without notifying listeners. */
    setPosition(id, seconds) {
      if (seconds > 1) positions[id] = Math.floor(seconds);
      else delete positions[id];
      const known = new Set(items.map((it) => it.id));
      for (const key of Object.keys(positions)) if (!known.has(key)) delete positions[key];
      save();
    },
  };
}
