import { useCallback, useState, type PropsWithChildren } from 'react';
import { createHowlerSoundEngine } from './engine';
import { SoundContext } from './context';
import { readMutedFromStorage, writeMutedToStorage, type SoundStorage } from './storage';
import type { SoundEngine } from './types';

export interface SoundProviderProps extends PropsWithChildren {
  /** Test injection point; production uses the lazy Howler engine. */
  engine?: SoundEngine;
  /** Test injection point; production uses window.localStorage when available. */
  storage?: SoundStorage;
}

function browserStorage(): SoundStorage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Owns the user sound preference and hides the playback implementation behind
 * a tiny context. Howler is not imported until the first cue is requested.
 */
export function SoundProvider({
  engine: injectedEngine,
  storage: injectedStorage,
  children,
}: SoundProviderProps) {
  const [storage] = useState<SoundStorage | undefined>(() => injectedStorage ?? browserStorage());
  const [engine] = useState<SoundEngine>(() => injectedEngine ?? createHowlerSoundEngine());
  const [muted, setMutedState] = useState(() => readMutedFromStorage(storage));

  const setMuted = useCallback(
    (nextMuted: boolean) => {
      setMutedState(nextMuted);
      writeMutedToStorage(storage, nextMuted);
    },
    [storage],
  );

  const toggleMuted = useCallback(() => {
    setMutedState((currentMuted) => {
      const nextMuted = !currentMuted;
      writeMutedToStorage(storage, nextMuted);
      return nextMuted;
    });
  }, [storage]);

  const play = useCallback(
    (cue: Parameters<SoundEngine['play']>[0]) => {
      if (!muted) engine.play(cue);
    },
    [engine, muted],
  );

  const prime = useCallback(() => engine.prime(), [engine]);

  return (
    <SoundContext.Provider value={{ muted, setMuted, toggleMuted, play, prime }}>
      {children}
    </SoundContext.Provider>
  );
}
