import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { resources } from './index';

/** Enum families the backend sends as plain strings. */
export type EnumGroup = keyof (typeof resources)['en']['enums'];

/** Keep unknown backend values readable instead of exposing raw snake_case. */
function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

/**
 * Translate backend enum values such as account roles, room states, streets, and action types.
 *
 * Values the frontend does not know yet fall back to a humanized form of the raw string, so a new
 * backend enum member degrades gracefully instead of rendering an untranslated key.
 */
export function useEnumLabel() {
  const { t, i18n } = useTranslation('enums');
  // Backend enum values arrive as plain strings, so keys are assembled at runtime. The English
  // bundle stays the source of truth because `i18n.exists` guards every lookup.
  const translate = t as unknown as (key: string) => string;

  return useCallback(
    (group: EnumGroup, value: string | null | undefined): string => {
      if (!value) {
        return '';
      }

      const key = `${group}.${value}`;
      return i18n.exists(`enums:${key}`) ? translate(key) : humanize(value);
    },
    [i18n, translate],
  );
}
