import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import i18n, { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, normalizeLanguage } from '../i18n';

describe('i18n runtime', () => {
  it('supports exactly English and Simplified Chinese', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'zh']);
    expect(i18n.options.fallbackLng).toEqual(['en']);
    expect(i18n.options.load).toBe('languageOnly');
  });

  it('starts in English for tests', () => {
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
    expect(i18n.t('appName')).toBe('DokerFace');
  });

  it('normalizes every Chinese variant to zh', () => {
    expect(normalizeLanguage('zh')).toBe('zh');
    expect(normalizeLanguage('zh-CN')).toBe('zh');
    expect(normalizeLanguage('zh-SG')).toBe('zh');
    expect(normalizeLanguage('zh-TW')).toBe('zh');
    expect(normalizeLanguage('zh-Hant-HK')).toBe('zh');
    expect(normalizeLanguage('zh_CN')).toBe('zh');
  });

  it('normalizes English variants to en', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('en-GB')).toBe('en');
    expect(normalizeLanguage('EN-US')).toBe('en');
  });

  it('falls back to English for unsupported or missing languages', () => {
    expect(normalizeLanguage('fr')).toBe('en');
    expect(normalizeLanguage('de-DE')).toBe('en');
    expect(normalizeLanguage('')).toBe('en');
    expect(normalizeLanguage(null)).toBe('en');
    expect(normalizeLanguage(undefined)).toBe('en');
  });

  it('resolves Chinese translations after switching language', async () => {
    await i18n.changeLanguage('zh');

    expect(i18n.language).toBe('zh');
    expect(i18n.t('language.label')).toBe('语言');
  });

  it('falls back to the English text when a Chinese key is missing', async () => {
    const probe = createInstance();
    await probe.init({
      resources: {
        en: { common: { appName: 'DokerFace' } },
        zh: { common: {} },
      },
      lng: 'zh',
      fallbackLng: 'en',
      defaultNS: 'common',
      initAsync: false,
    });

    expect(probe.t('appName')).toBe('DokerFace');
  });
});
