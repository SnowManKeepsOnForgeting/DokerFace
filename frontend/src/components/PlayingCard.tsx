import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/** Backend cards use standard poker shorthand, where "T" is the ten. */
const RANK_LABELS: Record<string, string> = { T: '10' };

const SUITS: Record<string, { char: string; color: string }> = {
  s: { char: '♠', color: 'text-slate-800' },
  h: { char: '♥', color: 'text-rose-500' },
  d: { char: '♦', color: 'text-rose-500' },
  c: { char: '♣', color: 'text-slate-800' },
};

const face = cva(
  'bg-card-face border-card-edge relative flex flex-col justify-between rounded border text-left font-sans text-slate-900 shadow-md select-none',
  {
    variants: {
      /** Board cards, seat cards and history rows need three distinct scales. */
      size: {
        board: 'h-9 w-[1.6rem] p-0.5 sm:h-14 sm:w-10 sm:p-1.5 md:h-18 md:w-12',
        seat: 'h-7 w-5 p-0.5 sm:h-9 sm:w-6 md:h-14 md:w-10 md:p-1.5',
        mini: 'h-12 w-8 p-1',
      },
    },
    defaultVariants: { size: 'board' },
  },
);

const rankText = {
  board: 'text-[9px] sm:text-xs',
  seat: 'text-[8px] sm:text-[9px] md:text-xs',
  mini: 'text-[10px]',
} as const;

const suitText = {
  board: 'text-sm sm:text-lg md:text-xl',
  seat: 'text-xs sm:text-sm md:text-xl',
  mini: 'text-sm',
} as const;

type CardSize = NonNullable<VariantProps<typeof face>['size']>;

type PlayingCardProps = {
  /** Card in backend shorthand, for example `As` or `Th`. */
  card: string;
  size?: CardSize;
  /** Deal-in keyframe. Disabled for static surfaces such as hand history. */
  animated?: boolean;
  /** Stagger in milliseconds, applied as an animation delay. */
  delayMs?: number;
  className?: string;
};

/**
 * One face-up card.
 *
 * The single card renderer for the table board, the seat hole cards and the
 * hand history rows, so rank formatting and suit colours cannot drift apart.
 * The rank stays in the top-left corner even when a parent centres its text.
 */
export function PlayingCard({
  card,
  size = 'board',
  animated = false,
  delayMs = 0,
  className,
}: PlayingCardProps) {
  if (!card || card.length < 2) return null;

  const rankCode = card.slice(0, -1).toUpperCase();
  const rank = RANK_LABELS[rankCode] ?? rankCode;
  const suitCode = card.slice(-1);
  const suit = SUITS[suitCode] ?? { char: suitCode, color: 'text-slate-400' };
  const showBottomRank = size !== 'mini';

  return (
    <div
      className={cn(face({ size }), animated && 'animate-deal-in', className)}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      <div className={cn(rankText[size], 'leading-none font-black')}>{rank}</div>
      <div className={cn(suitText[size], 'text-center leading-none font-bold', suit.color)}>
        {suit.char}
      </div>
      {showBottomRank ? (
        <div className={cn(rankText[size], 'self-end rotate-180 leading-none font-black')}>
          {rank}
        </div>
      ) : null}
    </div>
  );
}

/** Face-down card for opponents' hole cards and the deck. */
export function CardBack({ size = 'board', className }: { size?: CardSize; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        face({ size }),
        'bg-card-back border-rose-200/70 p-0.5 shadow-md',
        'border-2',
        className,
      )}
    >
      <div className="h-full w-full rounded-sm border border-rose-200/60 bg-rose-400/70" />
    </div>
  );
}

export { RANK_LABELS };
