import type { WriterConfig } from './fragment-writer';

// A signed-in author keeps working after a refresh; closing the tab ends the session.
const token = /^[A-Za-z0-9_]{1,4096}$/;
const keyFor = (config: WriterConfig) => `fragment-writer:${config.repo}:${config.branch}`;
const storage = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

export function storeSession(config: WriterConfig, value: string, store = storage()) {
  if (!store) return;
  try {
    if (token.test(value)) store.setItem(keyFor(config), value);
    else store.removeItem(keyFor(config));
  } catch { /* Private windows and blocked storage must not break signing in. */ }
}

export function loadSession(config: WriterConfig, store = storage()): string {
  if (!store) return '';
  try {
    const value = store.getItem(keyFor(config)) ?? '';
    if (token.test(value)) return value;
    store.removeItem(keyFor(config));
    return '';
  } catch { return ''; }
}

export function clearSession(config: WriterConfig, store = storage()) {
  if (!store) return;
  try { store.removeItem(keyFor(config)); } catch { /* Nothing more to do. */ }
}
