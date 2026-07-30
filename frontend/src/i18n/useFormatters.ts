import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from './index';

type DateInput = string | number | Date;

/**
 * Locale aware number and date formatting.
 *
 * Every surface must use these helpers instead of the bare `toLocale*` methods so chip amounts and
 * timestamps follow the language the player selected rather than the browser locale.
 */
export function useFormatters() {
  const { i18n } = useTranslation();
  const locale = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

  return useMemo(() => {
    const numberFormat = new Intl.NumberFormat(locale);
    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const dateTimeFormat = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });

    const toDate = (value: DateInput): Date | null => {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    return {
      locale,
      /** Chip and currency-like amounts, grouped for the active locale. */
      formatChips: (value: number) => numberFormat.format(value),
      formatNumber: (value: number) => numberFormat.format(value),
      /** `ratio` is a fraction, so 0.42 renders as 42.0%. */
      formatPercent: (ratio: number, fractionDigits = 1) =>
        new Intl.NumberFormat(locale, {
          style: 'percent',
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }).format(ratio),
      formatDate: (value: DateInput) => {
        const date = toDate(value);
        return date ? dateFormat.format(date) : '';
      },
      formatDateTime: (value: DateInput) => {
        const date = toDate(value);
        return date ? dateTimeFormat.format(date) : '';
      },
      formatTime: (value: DateInput) => {
        const date = toDate(value);
        return date ? timeFormat.format(date) : '';
      },
    };
  }, [locale]);
}
