import type {
  GameHandSettled,
  GameMatchSettled,
  GamePublicSnapshot,
  GamePrivateSnapshot,
} from '../contracts/realtime';
import type { SoundCue } from './types';

export type GameSnapshot = GamePublicSnapshot | GamePrivateSnapshot;

export interface DerivedSoundCue {
  cue: SoundCue;
  key: string;
}

function cue(cueName: SoundCue, key: string): DerivedSoundCue {
  return { cue: cueName, key };
}

function actionCue(
  snapshot: GameSnapshot,
  action: NonNullable<GameSnapshot['actions']>[number],
  earlierActions: NonNullable<GameSnapshot['actions']>,
): SoundCue | null {
  const player = snapshot.players.find((candidate) => candidate.account_id === action.account_id);
  if (action.action === 'fold') {
    return 'fold';
  }
  if (action.action === 'check_or_call') {
    if (player?.all_in || player?.stack === 0) {
      return 'all-in';
    }
    return action.amount === 0 ? 'check' : 'call';
  }
  if (action.action === 'bet_or_raise') {
    if (player?.all_in || player?.stack === 0) {
      return 'all-in';
    }
    const raisedThisStreet = earlierActions.some(
      (earlier) =>
        earlier.sequence_no < action.sequence_no &&
        earlier.street === action.street &&
        earlier.action === 'bet_or_raise',
    );
    return raisedThisStreet ? 'raise' : 'bet';
  }
  return null;
}

function remainingSeconds(snapshot: GameSnapshot): number | null {
  if (snapshot.action_deadline_at === null || snapshot.action_deadline_at === undefined) {
    return null;
  }
  const deadline = Date.parse(snapshot.action_deadline_at);
  const serverTime = Date.parse(snapshot.server_time);
  if (!Number.isFinite(deadline) || !Number.isFinite(serverTime)) {
    return null;
  }
  const remaining = Math.ceil((deadline - serverTime) / 1000);
  return remaining >= 1 && remaining <= 5 ? remaining : null;
}

/** Derive sound events from two consecutive authoritative snapshots. */
export function deriveSoundCues(
  previous: GameSnapshot | null | undefined,
  next: GameSnapshot,
  heroAccountId: number,
): DerivedSoundCue[] {
  if (
    previous === null ||
    previous === undefined ||
    previous.match_id !== next.match_id ||
    next.state_version <= previous.state_version
  ) {
    return [];
  }

  // A state-version gap means this is likely a reconnect snapshot. Its complete board and action
  // history must become the new baseline instead of replaying every missed sound.
  if (next.state_version - previous.state_version > 1) {
    return [];
  }

  const handChanged = previous.hand_id !== next.hand_id;
  if (handChanged) {
    return [cue('new-hand', `new-hand:${next.match_id}:${next.hand_id}`)];
  }

  const result: DerivedSoundCue[] = [];
  const seen = new Set<string>();
  const add = (soundCue: SoundCue, key: string) => {
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cue(soundCue, key));
    }
  };

  const previousActions = previous.actions ?? [];
  const nextActions = next.actions ?? [];
  const previousMaxSequence = previousActions.reduce(
    (max, action) => Math.max(max, action.sequence_no),
    -1,
  );
  const earlierActions = nextActions.filter((action) => action.sequence_no <= previousMaxSequence);
  const newActions = nextActions
    .filter((action) => action.sequence_no > previousMaxSequence)
    .sort((left, right) => left.sequence_no - right.sequence_no);

  for (const action of newActions) {
    const actionSound = actionCue(next, action, [...earlierActions, ...newActions]);
    if (actionSound !== null) {
      add(actionSound, `action:${next.match_id}:${next.hand_id}:${action.sequence_no}`);
    }
  }

  if (next.board.length > previous.board.length) {
    const boardIsAppendOnly = previous.board.every((card, index) => next.board[index] === card);
    if (boardIsAppendOnly) {
      for (let index = previous.board.length; index < next.board.length; index += 1) {
        add(
          'deal-card',
          `deal-card:${next.match_id}:${next.hand_id}:${index}:${next.board[index]}`,
        );
      }
    }
  }

  if (previous.actor_account_id !== heroAccountId && next.actor_account_id === heroAccountId) {
    add('your-turn', `your-turn:${next.match_id}:${next.hand_id}:${next.state_version}`);
  }

  if (next.actor_account_id === heroAccountId) {
    const seconds = remainingSeconds(next);
    if (seconds !== null) {
      add('timer-tick', `timer-tick:${next.match_id}:${next.hand_id}:${seconds}`);
    }
  }

  return result;
}

export function deriveHandSettlementCue(
  settlement: GameHandSettled,
  heroAccountId: number,
): DerivedSoundCue | null {
  const heroIndex = settlement.account_ids.indexOf(heroAccountId);
  if (heroIndex < 0 || settlement.payoffs[heroIndex] === undefined) {
    return null;
  }
  const won = settlement.payoffs[heroIndex] > 0;
  return cue(
    won ? 'hand-win' : 'hand-lose',
    `hand-settled:${settlement.match_id}:${settlement.hand_id}:${settlement.state_version}:${won ? 'win' : 'lose'}`,
  );
}

export function deriveMatchSettlementCue(
  settlement: GameMatchSettled,
  heroAccountId: number,
): DerivedSoundCue | null {
  if (settlement.status !== 'completed') {
    return null;
  }
  const heroIndex = settlement.account_ids.indexOf(heroAccountId);
  const heroStack = settlement.final_stacks[heroIndex];
  if (heroIndex < 0 || heroStack === undefined) {
    return null;
  }
  const highestStack = Math.max(...settlement.final_stacks);
  if (heroStack !== highestStack) {
    return null;
  }
  return cue('match-win', `match-settled:${settlement.match_id}:${settlement.state_version}:win`);
}

export function deriveSettlementCue(
  settlement: GameHandSettled | GameMatchSettled,
  heroAccountId: number,
): DerivedSoundCue[] {
  if ('hand_id' in settlement && 'payoffs' in settlement) {
    const handCue = deriveHandSettlementCue(settlement as GameHandSettled, heroAccountId);
    return handCue === null ? [] : [handCue];
  }
  const matchCue = deriveMatchSettlementCue(settlement, heroAccountId);
  return matchCue === null ? [] : [matchCue];
}
