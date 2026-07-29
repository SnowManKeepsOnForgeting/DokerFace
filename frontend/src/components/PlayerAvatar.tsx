import { useQuery } from '@tanstack/react-query';
import { getPlayerApiV1PlayersAccountIdGet } from '../contracts/rest';

export const DEFAULT_AVATAR_BACKGROUND_COLOR = '#4f46e5';

type PlayerAvatarProps = {
  accountId: number;
  /** Name used for initials while the public profile is unavailable. */
  fallbackName?: string | null;
  /** Size, border and typography classes supplied by the surrounding surface. */
  className?: string;
  label?: string;
};

/**
 * Render one player's text or emoji avatar from their public profile.
 *
 * Every surface reads the same `['player', accountId]` query, so invalidating
 * that key after a profile update refreshes the sidebar, the waiting room and
 * the table seats together.
 */
export function PlayerAvatar({
  accountId,
  fallbackName,
  className = '',
  label,
}: PlayerAvatarProps) {
  const { data: player } = useQuery({
    queryKey: ['player', accountId],
    queryFn: () =>
      getPlayerApiV1PlayersAccountIdGet({
        path: { account_id: accountId },
        throwOnError: true,
      }),
    enabled: accountId > 0,
    staleTime: 60 * 1000,
  });

  const name = player?.display_name || fallbackName || '';
  const text = player?.avatar_text || name.slice(0, 2).toUpperCase() || 'P';
  const backgroundColor = player?.avatar_background_color || DEFAULT_AVATAR_BACKGROUND_COLOR;

  return (
    <div
      aria-label={label}
      className={`flex min-w-0 shrink-0 items-center justify-center overflow-hidden rounded-full px-0.5 text-center leading-tight font-bold break-all whitespace-pre-wrap text-white ${className}`}
      style={{ backgroundColor }}
    >
      {text}
    </div>
  );
}
