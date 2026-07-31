import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const panel = cva('rounded-panel border', {
  variants: {
    tone: {
      default: 'border-border-subtle bg-surface',
      raised: 'border-border-subtle bg-surface-raised',
      sunken: 'border-border-subtle bg-surface-sunken',
      accent: 'border-accent-border bg-accent-muted',
      danger: 'border-danger-border bg-danger-surface',
      dashed: 'border-dashed border-border-subtle bg-transparent',
    },
    padding: {
      none: 'p-0',
      tight: 'p-3',
      default: 'p-4',
      roomy: 'p-5',
    },
  },
  defaultVariants: { tone: 'default', padding: 'default' },
});

type PanelProps = VariantProps<typeof panel> & {
  children: ReactNode;
  className?: string;
  /** Rendered element. Sections and articles carry more meaning than a div. */
  as?: 'div' | 'section' | 'article' | 'aside';
};

/**
 * The single surface container for cards, list wrappers and side panels.
 *
 * Composition instead of configuration: header, body and footer are separate
 * child components rather than `hasHeader` / `headerTitle` props, so a caller
 * can put anything in a region without new props appearing here.
 */
export function Panel({ children, className, tone, padding, as: Tag = 'div' }: PanelProps) {
  return <Tag className={cn(panel({ tone, padding }), className)}>{children}</Tag>;
}

function PanelHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>{children}</div>
  );
}

function PanelTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-accent-text text-sm font-bold tracking-wider uppercase', className)}>
      {children}
    </h2>
  );
}

function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0', className)}>{children}</div>;
}

function PanelFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('border-border-subtle mt-4 flex items-center gap-3 border-t pt-4', className)}
    >
      {children}
    </div>
  );
}

Panel.Header = PanelHeader;
Panel.Title = PanelTitle;
Panel.Body = PanelBody;
Panel.Footer = PanelFooter;
