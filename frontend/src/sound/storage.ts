export const SOUND_STORAGE_KEY = 'dokerface.sound';

export interface SoundPreference {
  v: 1;
  muted: boolean;
}

export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSoundPreference(raw: string | null): SoundPreference {
  if (raw === null) {
    return { v: 1, muted: false };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'v' in parsed &&
      parsed.v === 1 &&
      'muted' in parsed &&
      typeof parsed.muted === 'boolean'
    ) {
      return { v: 1, muted: parsed.muted };
    }
  } catch {
    // Malformed preference values are treated as the default preference.
  }

  return { v: 1, muted: false };
}

export function saveSoundPreference(muted: boolean): string {
  return JSON.stringify({ v: 1, muted });
}

export function loadMuted(raw: string | null): boolean {
  return loadSoundPreference(raw).muted;
}

export function saveMuted(muted: boolean): string {
  return saveSoundPreference(muted);
}

export function readMutedFromStorage(storage: SoundStorage | null | undefined): boolean {
  if (storage === null || storage === undefined) {
    return false;
  }

  try {
    return loadMuted(storage.getItem(SOUND_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function writeMutedToStorage(
  storage: SoundStorage | null | undefined,
  muted: boolean,
): void {
  if (storage === null || storage === undefined) {
    return;
  }

  try {
    storage.setItem(SOUND_STORAGE_KEY, saveMuted(muted));
  } catch {
    // Storage can be unavailable in private browsing or a sandboxed iframe.
  }
}
