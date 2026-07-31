import { cn } from '../lib/cn';

export const DEFAULT_AVATAR_BACKGROUND_COLOR = '#4f46e5';

type ProfileAvatarBadgeProps = {
  /** Avatar text from a payload that already carries profile fields. */
  avatarText?: string | null;
  backgroundColor?: string | null;
  /** Used for initials when the payload has no avatar text. */
  displayName?: string | null;
  /** Size, border and typography classes supplied by the surrounding surface. */
  className?: string;
  label?: string;
};

/**
 * Presentational avatar for list payloads that already include profile fields.
 *
 * The leaderboard and other bulk lists receive `avatar_text` and
 * `avatar_background_color` inside their own response, so they render through
 * this component instead of `PlayerAvatar`. `PlayerAvatar` fetches
 * `['player', accountId]` per account, which would turn a 100-row leaderboard
 * into 100 requests. Surfaces that show a handful of players, such as the
 * sidebar, the waiting room and the table seats, keep using `PlayerAvatar`.
 */
export function ProfileAvatarBadge({
  avatarText,
  backgroundColor,
  displayName,
  className,
  label,
}: ProfileAvatarBadgeProps) {
  const name = displayName ?? '';
  const text = avatarText || name.slice(0, 2).toUpperCase() || 'P';

  return (
    <div
      aria-label={label}
      className={cn(
        'flex min-w-0 shrink-0 items-center justify-center overflow-hidden rounded-full px-0.5 text-center leading-tight font-bold break-all whitespace-pre-wrap text-white',
        className,
      )}
      style={{ backgroundColor: backgroundColor || DEFAULT_AVATAR_BACKGROUND_COLOR }}
    >
      {text}
    </div>
  );
}
