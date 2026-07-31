import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSound, SoundProvider, type SoundEngine } from '../sound';
import {
  deriveSoundCues,
  loadMuted,
  loadSoundPreference,
  saveSoundPreference,
  SOUND_STORAGE_KEY,
  type SoundCue,
} from '../sound';
import type { GamePublicSnapshot } from '../contracts/realtime';

function snapshot(overrides: Partial<GamePublicSnapshot> = {}): GamePublicSnapshot {
  return {
    match_id: 'match-1',
    hand_id: 'hand-1',
    hand_number: 1,
    state_version: 1,
    street: 'preflop',
    button_account_id: 1,
    actor_account_id: 1,
    board: [],
    pot_amounts: [20],
    complete: false,
    players: [
      {
        account_id: 1,
        seat: 0,
        display_name: 'Hero',
        stack: 100,
        bet: 0,
        folded: false,
        all_in: false,
      },
      {
        account_id: 2,
        seat: 1,
        display_name: 'Opponent',
        stack: 100,
        bet: 0,
        folded: false,
        all_in: false,
      },
    ],
    server_time: '2026-01-01T00:00:00.000Z',
    actions: [],
    action_deadline_at: '2026-01-01T00:00:10.000Z',
    ...overrides,
  };
}

function cues(previous: GamePublicSnapshot, next: Partial<GamePublicSnapshot>) {
  return deriveSoundCues(previous, { ...previous, ...next }, 1);
}

function CuesProbe() {
  const sound = useSound();
  return createElement(
    'div',
    null,
    createElement('output', { 'data-testid': 'muted' }, String(sound.muted)),
    createElement('button', { type: 'button', onClick: () => sound.play('chat') }, 'play'),
    createElement('button', { type: 'button', onClick: sound.toggleMuted }, 'toggle'),
  );
}

describe('sound preference storage', () => {
  it('defaults malformed and missing values to unmuted', () => {
    expect(loadMuted(null)).toBe(false);
    expect(loadMuted('{"v":2,"muted":true}')).toBe(false);
    expect(loadMuted('{"v":1,"muted":"yes"}')).toBe(false);
    expect(loadSoundPreference('{"v":1,"muted":true}')).toEqual({ v: 1, muted: true });
  });

  it('serializes only the versioned mute preference', () => {
    expect(saveSoundPreference(true)).toBe('{"v":1,"muted":true}');
    expect(SOUND_STORAGE_KEY).toBe('dokerface.sound');
  });
});

describe('sound cue derivation', () => {
  it('maps new actions, board growth, and the hero turn', () => {
    const previous = snapshot({ actor_account_id: 2 });
    const next = snapshot({
      state_version: 2,
      actor_account_id: 1,
      board: ['Ah', 'Kd', '2c'],
      actions: [
        {
          sequence_no: 1,
          state_version: 2,
          account_id: 2,
          street: 'preflop',
          action: 'fold',
        },
      ],
    });
    expect(deriveSoundCues(previous, next, 1)).toEqual([
      { cue: 'fold', key: 'action:match-1:hand-1:1' },
      { cue: 'deal-card', key: 'deal-card:match-1:hand-1:0:Ah' },
      { cue: 'deal-card', key: 'deal-card:match-1:hand-1:1:Kd' },
      { cue: 'deal-card', key: 'deal-card:match-1:hand-1:2:2c' },
      { cue: 'your-turn', key: 'your-turn:match-1:hand-1:2' },
    ]);
  });

  it('emits one timer tick for each remaining second while hero acts', () => {
    const previous = snapshot({ state_version: 1, action_deadline_at: '2026-01-01T00:00:06.000Z' });
    const next = snapshot({ state_version: 2, action_deadline_at: '2026-01-01T00:00:05.000Z' });
    expect(deriveSoundCues(previous, next, 1)).toEqual([
      { cue: 'timer-tick', key: 'timer-tick:match-1:hand-1:5' },
    ]);
    expect(deriveSoundCues(next, next, 1)).toEqual([]);
  });

  it('suppresses first, stale, reconnect, duplicate, and unrelated snapshots', () => {
    const initial = snapshot();
    expect(deriveSoundCues(null, initial, 1)).toEqual([]);
    expect(cues(initial, { state_version: 1, board: ['Ah'] })).toEqual([]);
    expect(cues(initial, { state_version: 4, board: ['Ah'] })).toEqual([]);
    expect(
      deriveSoundCues(initial, { ...initial, state_version: 2, match_id: 'other' }, 1),
    ).toEqual([]);
  });

  it('uses a hand change as the only new-hand cue', () => {
    expect(cues(snapshot(), { state_version: 2, hand_id: 'hand-2', hand_number: 2 })).toEqual([
      { cue: 'new-hand', key: 'new-hand:match-1:hand-2' },
    ]);
  });
});

describe('fake sound provider', () => {
  it('does not invoke the engine while muted and persists the toggle', () => {
    const played: SoundCue[] = [];
    const engine: SoundEngine = {
      play: (cue) => played.push(cue),
      prime: () => undefined,
    };
    const storage = new Map<string, string>();
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    render(
      createElement(SoundProvider, { engine, storage: fakeStorage }, createElement(CuesProbe)),
    );

    fireEvent.click(screen.getByRole('button', { name: 'play' }));
    expect(played).toEqual(['chat']);
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('muted')).toHaveTextContent('true');
    fireEvent.click(screen.getByRole('button', { name: 'play' }));
    expect(played).toEqual(['chat']);
    expect(storage.get(SOUND_STORAGE_KEY)).toBe('{"v":1,"muted":true}');
  });
});
