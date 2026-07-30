import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import i18n, { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from '../i18n';

// Node 26 exposes an experimental global `localStorage` that stays undefined unless
// `--localstorage-file` is passed, and it shadows the jsdom implementation. Provide an
// in-memory store so language persistence behaves like a browser during tests.
if (!window.localStorage) {
  const entries = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  });
}

// Every test starts in English with no stored preference so existing assertions stay stable.
// Tests that verify Chinese rendering switch the language explicitly.
beforeEach(async () => {
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  document.documentElement.lang = DEFAULT_LANGUAGE;
  await i18n.changeLanguage(DEFAULT_LANGUAGE);
});
