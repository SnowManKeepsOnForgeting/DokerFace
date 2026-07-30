import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '../i18n';
import { useLanguage } from '../i18n/useLanguage';

type LanguageSwitcherProps = {
  /** Drop the visible label so the control fits into dense headers. */
  compact?: boolean;
  className?: string;
};

/**
 * Switch the interface language between English and Simplified Chinese.
 *
 * Uses a native select for the same reason the rest of the application does: it is keyboard and
 * screen-reader accessible without extra wiring.
 */
export function LanguageSwitcher({ compact = false, className = '' }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { language, languages, setLanguage } = useLanguage();

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <Languages aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      {!compact && (
        <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
          {t('language.label')}
        </span>
      )}
      <select
        aria-label={t('language.switchLabel')}
        value={language}
        onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
        className="min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700/80 focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 focus:outline-none"
      >
        {languages.map((code) => (
          <option key={code} value={code}>
            {t(`language.options.${code}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
