import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const value = cva('mt-1 font-bold tabular-nums', {
  variants: {
    tone: {
      default: 'text-slate-100',
      accent: 'text-accent-text',
      success: 'text-success',
      warning: 'text-warning',
      danger: 'text-danger',
      muted: 'text-slate-400',
    },
    size: {
      sm: 'text-base',
      md: 'text-lg',
      lg: 'text-2xl',
    },
  },
  defaultVariants: { tone: 'default', size: 'md' },
});

type StatTileProps = VariantProps<typeof value> & {
  label: ReactNode;
  children: ReactNode;
  /** Secondary line under the value, e.g. sample size or trend. */
  detail?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/**
 * One labelled metric.
 *
 * Numbers use `tabular-nums` so a column of ratings or chip counts keeps its
 * digits aligned while values update.
 */
export function StatTile({ label, children, detail, icon, tone, size, className }: StatTileProps) {
  return (
    <div
      className={cn(
        'rounded-panel border-border-subtle bg-surface-sunken flex min-w-0 flex-col border p-4',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon ? <span className="text-accent-text shrink-0">{icon}</span> : null}
        <span className="truncate text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          {label}
        </span>
      </div>
      <p className={value({ tone, size })}>{children}</p>
      {detail ? <p className="mt-0.5 text-[10px] text-slate-500">{detail}</p> : null}
    </div>
  );
}
