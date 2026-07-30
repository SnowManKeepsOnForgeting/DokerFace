import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enEnums from './locales/en/enums.json';
import enErrors from './locales/en/errors.json';
import enGame from './locales/en/game.json';
import enLobby from './locales/en/lobby.json';
import enRoom from './locales/en/room.json';
import zhAuth from './locales/zh/auth.json';
import zhCommon from './locales/zh/common.json';
import zhEnums from './locales/zh/enums.json';
import zhErrors from './locales/zh/errors.json';
import zhGame from './locales/zh/game.json';
import zhLobby from './locales/zh/lobby.json';
import zhRoom from './locales/zh/room.json';

/** Every language the interface supports. Simplified Chinese only, without regional variants. */
export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/** Browser storage key holding the explicit user language choice. */
export const LANGUAGE_STORAGE_KEY = 'dokerface.language';

export const DEFAULT_NAMESPACE = 'common';

const englishResources = {
  auth: enAuth,
  common: enCommon,
  enums: enEnums,
  errors: enErrors,
  game: enGame,
  lobby: enLobby,
  room: enRoom,
};

const chineseResources = {
  auth: zhAuth,
  common: zhCommon,
  enums: zhEnums,
  errors: zhErrors,
  game: zhGame,
  lobby: zhLobby,
  room: zhRoom,
} satisfies typeof englishResources;

export const resources = {
  en: englishResources,
  zh: chineseResources,
};

function isSupportedLanguage(code: string): code is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

/**
 * Reduce any language tag to a supported language.
 *
 * Regional and script subtags are dropped, so `zh-CN`, `zh-SG`, `zh-TW`, and `zh-Hant-HK` all
 * resolve to Simplified Chinese. Unsupported languages fall back to English.
 */
export function normalizeLanguage(code: string | null | undefined): SupportedLanguage {
  if (!code) {
    return DEFAULT_LANGUAGE;
  }

  const base = code.toLowerCase().split(/[-_]/)[0];
  return isSupportedLanguage(base) ? base : DEFAULT_LANGUAGE;
}

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: SUPPORTED_LANGUAGES,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: DEFAULT_NAMESPACE,
    load: 'languageOnly',
    initAsync: false,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      convertDetectedLanguage: normalizeLanguage,
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18next;

/**
 * Mirror the active language onto the document.
 *
 * Registered as an i18next listener so startup detection and later user switches both update the
 * `lang` attribute assistive technology relies on, plus the browser tab title.
 */
function syncDocumentLanguage(language: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const normalized = normalizeLanguage(language);
  document.documentElement.lang = normalized;
  document.title = i18next.t('appTitle', { lng: normalized });
}

i18next.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage(i18next.resolvedLanguage ?? i18next.language ?? DEFAULT_LANGUAGE);
