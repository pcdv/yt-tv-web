// The settings of the TV and their persistence. No DOM: node tests it with a fake storage.
//
// `languages` is the ordered list of preferred audio languages of the native player: language
// codes such as `fr` or `pt-BR`, and `original` for the track the video marks as original.

export const SETTINGS_KEY = "yttv.settings.v1";
export const DEFAULT_LANGUAGES = ["original"];
export const MAX_LANGUAGES = 10;

const LANGUAGE = /^(original|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$/;

/** The cleaned list, or null when `list` is not a list of at most 10 valid, distinct entries. */
export function parseLanguages(list) {
  if (!Array.isArray(list) || list.length > MAX_LANGUAGES) return null;
  const out = [];
  for (const entry of list) {
    if (typeof entry !== "string") return null;
    const tag = entry.trim();
    if (!LANGUAGE.test(tag)) return null;
    if (!out.some((seen) => seen.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

export function createSettings(storage) {
  let languages = DEFAULT_LANGUAGES;

  try {
    const data = JSON.parse(storage.getItem(SETTINGS_KEY));
    const saved = data && parseLanguages(data.languages);
    if (saved && saved.length) languages = saved;
  } catch {
    // unreadable settings: keep the defaults
  }

  return {
    languages: () => languages.slice(),

    /** Replaces the list. False, and no change, when the list is invalid or empty. */
    setLanguages(list) {
      const parsed = parseLanguages(list);
      if (!parsed || !parsed.length) return false;
      languages = parsed;
      try {
        storage.setItem(SETTINGS_KEY, JSON.stringify({ languages }));
      } catch {
        // storage full or blocked: the setting lasts until the page reloads
      }
      return true;
    },
  };
}
