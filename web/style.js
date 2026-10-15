// Runs before the stylesheets so the saved page style and appearance, or the link's, are on the first paint, with no flash.
// Style: Normal, the plain heading, is the default. Halloween shows the letter-tile heading with a pumpkin O; Crayon
// draws each letter in its own crayon. A value saved as "varsity" or "classic" by an earlier version is read, and
// saved again, as "normal".
// Appearance: Light, Dark or Auto (the default, which follows the system and keeps following it). It is saved under
// its own key; data-appearance holds the choice and data-theme the light or dark actually shown.
(() => {
  const KEY = 'merge-o-matic-style', STYLES = ['normal', 'halloween', 'crayon'], RETIRED = ['varsity', 'classic'], root = document.documentElement;
  const APPEARANCE_KEY = 'merge-o-matic-appearance', APPEARANCES = ['light', 'dark', 'auto'];
  const store = () => { try { return window.localStorage || null; } catch { return null; } };
  const read = key => { try { return store()?.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { store()?.setItem(key, value); } catch {} };
  const valid = style => (STYLES.includes(style) ? style : 'normal');
  const validAppearance = value => (APPEARANCES.includes(value) ? value : 'auto');
  const system = (() => { try { return window.matchMedia?.('(prefers-color-scheme: dark)') || null; } catch { return null; } })();
  const THEME_COLOR = { normal: { light: '#f6f3ee', dark: '#13101c' }, halloween: { light: '#f7ecd8', dark: '#150b21' }, crayon: { light: '#fbf6e9', dark: '#1c3a2f' } };
  const listeners = new Set();
  const resolve = appearance => (appearance === 'auto' ? (system?.matches ? 'dark' : 'light') : appearance);
  const paintMeta = () => {
    const meta = document.querySelector?.('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[valid(root.dataset.style)][root.dataset.theme] || '#f6f3ee');
  };
  const apply = style => {
    root.dataset.style = style;
    paintMeta();
    return style;
  };
  const applyAppearance = appearance => {
    const before = root.dataset.theme;
    root.dataset.appearance = appearance;
    root.dataset.theme = resolve(appearance);
    if (root.style) root.style.colorScheme = root.dataset.theme;
    paintMeta();
    if (before && before !== root.dataset.theme) for (const fn of listeners) { try { fn(root.dataset.theme); } catch {} }
    return appearance;
  };
  // ?style= and ?appearance= in the link win for this visit only; they are not saved.
  const query = (() => { try { return new URLSearchParams(window.location?.search || ''); } catch { return null; } })();
  const linkStyle = query?.get('style'), linkAppearance = query?.get('appearance');
  const first = read(KEY);
  applyAppearance(APPEARANCES.includes(linkAppearance) ? linkAppearance : validAppearance(read(APPEARANCE_KEY)));
  apply(STYLES.includes(linkStyle) ? linkStyle : valid(first));
  if (RETIRED.includes(first)) write(KEY, 'normal');
  system?.addEventListener?.('change', () => { if (root.dataset.appearance === 'auto') applyAppearance('auto'); });
  window.momStyle = {
    key: KEY,
    styles: STYLES.slice(),
    get: () => valid(root.dataset.style),
    set(style) {
      const next = apply(valid(style));
      write(KEY, next);
      return next;
    }
  };
  window.momAppearance = {
    key: APPEARANCE_KEY,
    values: APPEARANCES.slice(),
    get: () => validAppearance(root.dataset.appearance),
    theme: () => root.dataset.theme,
    set(value) {
      const next = applyAppearance(validAppearance(value));
      write(APPEARANCE_KEY, next);
      return next;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
