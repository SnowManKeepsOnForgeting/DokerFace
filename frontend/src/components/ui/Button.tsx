import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const button = cva(
  'focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control border font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      /**
       * Explicit named intents instead of boolean flags. Adding `danger` never
       * requires touching a caller that uses `primary`.
       */
      intent: {
        primary: 'border-accent bg-accent-strong text-white hover:bg-accent',
        secondary:
          'border-border-strong/60 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100',
        ghost:
          'border-transparent bg-transparent text-slate-400 hover:bg-surface-hover hover:text-slate-100',
        outline:
          'border-border-subtle bg-surface-sunken text-slate-300 hover:border-border-strong hover:text-slate-100',
        success: 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500',
        danger:
          'border-rose-800/70 bg-rose-950/70 text-rose-200 hover:border-rose-600 hover:bg-rose-900 hover:text-white',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-10 w-10 p-0',
        iconSm: 'h-8 w-8 p-0',
      },
      /** Uppercase tracking is a table/console convention, not a new component. */
      emphasis: {
        normal: '',
        caps: 'text-xs font-bold tracking-wider uppercase',
      },
      width: {
        auto: '',
        full: 'w-full',
      },
    },
    defaultVariants: { intent: 'primary', size: 'md', emphasis: 'normal', width: 'auto' },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & {
    children?: ReactNode;
    /** Render the styles onto the child element, e.g. a router `Link`. */
    asChild?: boolean;
  };

export function Button({
  className,
  intent,
  size,
  emphasis,
  width,
  asChild = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(button({ intent, size, emphasis, width }), className)}
      {...(asChild ? {} : { type })}
      {...props}
    />
  );
}
