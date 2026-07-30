import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Translate Socket.IO error codes such as `room_not_waiting` or `not_current_actor`.
 *
 * The backend emits stable machine codes for realtime rejections, so they can be localized without
 * touching the API. Codes the frontend does not know yet fall back to a generic message that keeps
 * the raw code visible for support.
 */
export function useRealtimeError() {
  const { t, i18n } = useTranslation('errors');
  // Codes arrive as plain strings from the socket, so the key is assembled at runtime.
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string;

  return useCallback(
    (code: string | null | undefined): string => {
      if (!code) {
        return translate('realtime.realtime_error');
      }

      return i18n.exists(`errors:realtime.${code}`)
        ? translate(`realtime.${code}`)
        : translate('unknown', { code });
    },
    [i18n, translate],
  );
}
