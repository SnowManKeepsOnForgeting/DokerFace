import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, normalizeLanguage, type SupportedLanguage } from './index';

/**
 * Read and change the interface language.
 *
 * `i18next.changeLanguage` persists the choice through the browser language detector cache, and
 * the listener in `src/i18n/index.ts` mirrors it onto `<html lang>` and the document title, so
 * callers only need to trigger the change.
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

  const setLanguage = useCallback(
    (next: SupportedLanguage) => {
      if (next === language) {
        return;
      }

      void i18n.changeLanguage(next);
    },
    [i18n, language],
  );

  return { language, languages: SUPPORTED_LANGUAGES, setLanguage };
}
