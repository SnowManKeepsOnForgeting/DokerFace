import { describe, expect, it } from 'vitest';
import { orderPlayersForViewer } from '../lib/tableSeats';

describe('orderPlayersForViewer', () => {
  it('places every viewer first without losing or duplicating players for 2-8 seats', () => {
    for (let playerCount = 2; playerCount <= 8; playerCount += 1) {
      const players = Array.from({ length: playerCount }, (_, seat) => ({
        account_id: 100 + seat,
        seat,
      })).reverse();

      for (const viewer of players) {
        const ordered = orderPlayersForViewer(players, viewer.account_id);

        expect(ordered[0]?.account_id).toBe(viewer.account_id);
        expect(new Set(ordered.map((player) => player.account_id)).size).toBe(playerCount);
        expect(ordered).toHaveLength(playerCount);
      }
    }
  });

  it('preserves clockwise order when active seats contain gaps', () => {
    const players = [
      { account_id: 30, seat: 5 },
      { account_id: 10, seat: 0 },
      { account_id: 20, seat: 2 },
    ];

    expect(orderPlayersForViewer(players, 30).map((player) => player.seat)).toEqual([5, 0, 2]);
    expect(players.map((player) => player.seat)).toEqual([5, 0, 2]);
  });

  it('falls back to real seat order when the viewer is absent', () => {
    const players = [
      { account_id: 2, seat: 4 },
      { account_id: 1, seat: 1 },
    ];

    expect(orderPlayersForViewer(players, 99).map((player) => player.seat)).toEqual([1, 4]);
  });
});
