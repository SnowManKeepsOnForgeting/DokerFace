import { createContext, useContext } from 'react';
import type { SoundCue, SoundEngine } from './types';

export interface SoundContextValue {
  muted: boolean;
  setMuted(muted: boolean): void;
  toggleMuted(): void;
  play(cue: SoundCue): void;
  prime(): void;
}

export interface SoundContextDependencies {
  engine?: SoundEngine;
}

const NOOP_SOUND_CONTEXT: SoundContextValue = {
  muted: false,
  setMuted: () => undefined,
  toggleMuted: () => undefined,
  play: () => undefined,
  prime: () => undefined,
};

export const SoundContext = createContext<SoundContextValue>(NOOP_SOUND_CONTEXT);

export function useSound(): SoundContextValue {
  return useContext(SoundContext);
}
