import './local-storage-shim';
import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import i18n, { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from '../i18n';

// Every test starts in English with no stored preference so existing assertions stay stable.
// Tests that verify Chinese rendering switch the language explicitly.
beforeEach(async () => {
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  document.documentElement.lang = DEFAULT_LANGUAGE;
  await i18n.changeLanguage(DEFAULT_LANGUAGE);
});
