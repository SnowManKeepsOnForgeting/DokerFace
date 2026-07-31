import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const CONTROL_CLASSES =
  'focus-ring rounded-control border-border-subtle bg-surface-sunken w-full text-sm text-slate-100 outline-none transition-colors placeholder-slate-600 focus:border-accent/60 disabled:opacity-60';

type FieldProps = {
  label: ReactNode;
  /** Validation message. Present value marks the control invalid. */
  error?: string | null;
  hint?: ReactNode;
  className?: string;
  /** Receives the generated id plus the aria wiring for the control. */
  children: (props: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
};

/**
 * Label, control and message wired together.
 *
 * The control is supplied as a render callback so the same accessibility wiring
 * serves inputs, selects, textareas and composite controls without this
 * component growing a `type` prop for each one.
 */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={id} className="text-xs font-bold tracking-wider text-slate-400 uppercase">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-[10px] text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-danger text-xs font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Text-like input carrying the shared control treatment. */
export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_CLASSES, 'h-10 px-3', className)} {...props} />;
}

/** Native select carrying the shared control treatment. */
export function SelectInput({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL_CLASSES, 'h-10 cursor-pointer px-3', className)} {...props}>
      {children}
    </select>
  );
}

export { CONTROL_CLASSES };
