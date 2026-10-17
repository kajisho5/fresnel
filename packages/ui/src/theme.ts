/** App theme: dark (default), light or follow the system. */
export type Theme = 'dark' | 'light' | 'system';

const KEY = 'fresnel.theme';
let media: MediaQueryList | null = null;

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function apply(theme: Theme) {
  const resolved = theme === 'system' ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  if (resolved === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  initTheme();
}

export function initTheme() {
  const theme = getTheme();
  apply(theme);
  media ??= window.matchMedia?.('(prefers-color-scheme: light)') ?? null;
  if (media) media.onchange = () => getTheme() === 'system' && apply('system');
}
