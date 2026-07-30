import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and let later Tailwind utilities win.
 *
 * `clsx` flattens arrays, objects and falsy values; `twMerge` then removes
 * earlier utilities that conflict with later ones, so a caller can override a
 * component's default `px-4` by passing `px-6` without fighting specificity.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
