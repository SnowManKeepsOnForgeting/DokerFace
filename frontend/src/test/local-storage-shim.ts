// Node 26 exposes an experimental global `localStorage` that stays undefined unless
// `--localstorage-file` is passed, and it shadows the jsdom implementation. Provide an in-memory
// store so language persistence behaves like a browser during tests.
//
// This module must be imported before anything that touches storage: the i18next browser language
// detector memoizes whether localStorage is usable on its first access.
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
