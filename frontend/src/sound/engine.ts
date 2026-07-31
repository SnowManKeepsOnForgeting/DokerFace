import { SOUND_ASSETS, SOUND_VOLUMES, type SoundCue, type SoundEngine } from './types';

const HOT_CUES: readonly SoundCue[] = ['deal-card', 'timer-tick', 'chat', 'emote'];

type HowlerModule = typeof import('howler');

function canUseAudio(): boolean {
  return (
    typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Audio !== 'undefined'
  );
}

function isVisible(): boolean {
  return typeof document === 'undefined' || !document.hidden;
}

export class HowlerSoundEngine implements SoundEngine {
  private modulePromise: Promise<HowlerModule> | null = null;
  private readonly sounds = new Map<SoundCue, import('howler').Howl>();

  play(cue: SoundCue): void {
    if (!canUseAudio() || !isVisible()) {
      return;
    }

    void this.loadModule()
      .then((module) => {
        if (!canUseAudio() || !isVisible() || module.Howler.noAudio) {
          return;
        }

        const sound = this.getSound(module, cue);
        if (!sound) {
          return;
        }
        try {
          sound.play();
        } catch {
          // Unsupported codecs and browser autoplay restrictions are silent no-ops.
        }
      })
      .catch(() => {
        // A failed dynamic import must not affect gameplay.
      });
  }

  prime(): void {
    if (!canUseAudio()) {
      return;
    }

    void this.loadModule()
      .then((module) => {
        if (module.Howler.noAudio) {
          return;
        }

        try {
          const context = module.Howler.ctx;
          if (context?.state === 'suspended') {
            void context.resume().catch(() => undefined);
          }
          for (const cue of HOT_CUES) {
            this.getSound(module, cue);
          }
        } catch {
          // Audio unlocking is best effort and is retried on the next user gesture.
        }
      })
      .catch(() => {
        // A failed dynamic import must not affect gameplay.
      });
  }

  private loadModule(): Promise<HowlerModule> {
    this.modulePromise ??= import('howler');
    return this.modulePromise;
  }

  private getSound(module: HowlerModule, cue: SoundCue): import('howler').Howl | null {
    const existing = this.sounds.get(cue);
    if (existing) {
      return existing;
    }

    try {
      if (!module.Howler.codecs('ogg') && !module.Howler.codecs('mp3')) {
        return null;
      }
      const sound = new module.Howl({
        src: [...SOUND_ASSETS[cue]],
        volume: SOUND_VOLUMES[cue],
        preload: false,
        pool: 3,
      });
      this.sounds.set(cue, sound);
      return sound;
    } catch {
      return null;
    }
  }
}

export function createHowlerSoundEngine(): SoundEngine {
  return new HowlerSoundEngine();
}
