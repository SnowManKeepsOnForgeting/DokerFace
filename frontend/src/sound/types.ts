import type { Howl } from 'howler';

export const SOUND_CUES = [
  'new-hand',
  'deal-card',
  'check',
  'call',
  'bet',
  'raise',
  'fold',
  'all-in',
  'your-turn',
  'timer-tick',
  'hand-win',
  'hand-lose',
  'match-win',
  'chat',
  'emote',
] as const;

export type SoundCue = (typeof SOUND_CUES)[number];

/* Prefer Kenney's original Ogg Vorbis clips and fall back to derived MP3
 * copies for Safari/iOS versions without Ogg support. Howler selects the first
 * codec the current browser can decode. */
export const SOUND_ASSETS: Record<SoundCue, readonly string[]> = {
  'new-hand': ['/sounds/new-hand.ogg', '/sounds/new-hand.mp3'],
  'deal-card': ['/sounds/deal-card.ogg', '/sounds/deal-card.mp3'],
  check: ['/sounds/check.ogg', '/sounds/check.mp3'],
  call: ['/sounds/call.ogg', '/sounds/call.mp3'],
  bet: ['/sounds/bet.ogg', '/sounds/bet.mp3'],
  raise: ['/sounds/raise.ogg', '/sounds/raise.mp3'],
  fold: ['/sounds/fold.ogg', '/sounds/fold.mp3'],
  'all-in': ['/sounds/all-in.ogg', '/sounds/all-in.mp3'],
  'your-turn': ['/sounds/your-turn.ogg', '/sounds/your-turn.mp3'],
  'timer-tick': ['/sounds/timer-tick.ogg', '/sounds/timer-tick.mp3'],
  'hand-win': ['/sounds/hand-win.ogg', '/sounds/hand-win.mp3'],
  'hand-lose': ['/sounds/hand-lose.ogg', '/sounds/hand-lose.mp3'],
  'match-win': ['/sounds/match-win.ogg', '/sounds/match-win.mp3'],
  chat: ['/sounds/chat.ogg', '/sounds/chat.mp3'],
  emote: ['/sounds/emote.ogg', '/sounds/emote.mp3'],
};

export const SOUND_VOLUMES: Record<SoundCue, number> = {
  'new-hand': 0.75,
  'deal-card': 0.7,
  check: 0.75,
  call: 0.75,
  bet: 0.8,
  raise: 0.85,
  fold: 0.7,
  'all-in': 1,
  'your-turn': 0.85,
  'timer-tick': 0.35,
  'hand-win': 0.9,
  'hand-lose': 0.7,
  'match-win': 1,
  chat: 0.3,
  emote: 0.3,
};

export interface SoundEngine {
  play(cue: SoundCue): void;
  prime(): void;
}

export type HowlCache = Map<SoundCue, Howl>;
