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

/* Kenney's CC0 packs ship Ogg Vorbis. Howler's codec detection prevents a
 * request when the current browser cannot decode Ogg, and the engine silently
 * skips a cue in that browser rather than failing the game. */
export const SOUND_ASSETS: Record<SoundCue, readonly string[]> = {
  'new-hand': ['/sounds/new-hand.ogg'],
  'deal-card': ['/sounds/deal-card.ogg'],
  check: ['/sounds/check.ogg'],
  call: ['/sounds/call.ogg'],
  bet: ['/sounds/bet.ogg'],
  raise: ['/sounds/raise.ogg'],
  fold: ['/sounds/fold.ogg'],
  'all-in': ['/sounds/all-in.ogg'],
  'your-turn': ['/sounds/your-turn.ogg'],
  'timer-tick': ['/sounds/timer-tick.ogg'],
  'hand-win': ['/sounds/hand-win.ogg'],
  'hand-lose': ['/sounds/hand-lose.ogg'],
  'match-win': ['/sounds/match-win.ogg'],
  chat: ['/sounds/chat.ogg'],
  emote: ['/sounds/emote.ogg'],
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
