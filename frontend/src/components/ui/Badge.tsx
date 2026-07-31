import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const badge = cva(
  'inline-flex items-center gap-1 border font-bold tracking-wider uppercase whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border-subtle bg-slate-900 text-slate-400',
        accent: 'border-accent-border bg-accent-muted text-accent-text',
        success: 'border-success-border bg-success-surface text-success',
        warning: 'border-warning-border bg-warning-surface text-warning',
        danger: 'border-danger-border bg-danger-surface text-danger',
      },
      size: {
        xs: 'rounded px-1.5 py-0.5 text-[9px]',
        sm: 'rounded-full px-2.5 py-0.5 text-[10px]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

type BadgeProps = VariantProps<typeof badge> & {
  children: ReactNode;
  className?: string;
};

/** Status pill for room state, ready state, account status and rank themes. */
export function Badge({ children, className, tone, size }: BadgeProps) {
  return <span className={cn(badge({ tone, size }), className)}>{children}</span>;
}
