import { cn } from '../../lib/cn';

/**
 * Loading placeholder.
 *
 * A shimmering block rather than a spinner, so the incoming layout is already
 * visible and content arrival does not shift the page.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-panel border-border-subtle bg-surface shimmer-surface animate-shimmer border',
        className,
      )}
    />
  );
}

/** Full-page or panel-level loading state with an accessible status message. */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-1 flex-col items-center justify-center gap-4 py-12', className)}
    >
      <div className="border-accent h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">{label}</p>
    </div>
  );
}
